package roster

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"net/mail"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/mailer"
	"github.com/xuri/excelize/v2"
)

const (
	DriversCollection         = "drivers"
	UnitsCollection           = "units"
	DailyRostersCollection    = "daily_rosters"
	RosterEntriesCollection   = "roster_entries"
	StandbyEntriesCollection  = "standby_entries"
	WorkLogCollection         = "work_log"
	UnitDriverHistory         = "unit_driver_history"
	EmailRecipientsCollection = "email_recipients"
)

type Service struct {
	app core.App
}

type RosterResult struct {
	RosterID string `json:"roster_id"`
	Status   string `json:"status"`
}

func NewService(app core.App) *Service {
	return &Service{app: app}
}

func (s *Service) GenerateRoster(date time.Time) (*core.Record, error) {
	date = dayStart(date)
	var created *core.Record
	err := s.app.RunInTransaction(func(txApp core.App) error {
		tx := NewService(txApp)
		if err := tx.deleteRosterForDate(date); err != nil {
			return err
		}

		units, err := tx.activeUnits()
		if err != nil {
			return err
		}
		sort.Slice(units, func(i, j int) bool {
			if units[i].CyclePosition != units[j].CyclePosition {
				return units[i].CyclePosition < units[j].CyclePosition
			}
			return units[i].Number < units[j].Number
		})

		rosterCol, err := txApp.FindCollectionByNameOrId(DailyRostersCollection)
		if err != nil {
			return err
		}
		roster := core.NewRecord(rosterCol)
		roster.Set("date", date)
		roster.Set("status", "draft")
		if err := txApp.Save(roster); err != nil {
			return err
		}

		drivers, err := tx.activeDriversByID()
		if err != nil {
			return err
		}
		pool, err := tx.reliefPool(date, drivers)
		if err != nil {
			return err
		}
		poolByID := map[string]Driver{}
		for _, d := range pool {
			poolByID[d.ID] = d
		}

		times := DepartureTimes(units)
		entryCol, err := txApp.FindCollectionByNameOrId(RosterEntriesCollection)
		if err != nil {
			return err
		}
		weekday := WeekdayKey(date)
		for _, unit := range units {
			driverID := unit.BaseDriverID
			isSubstitute := false
			base := drivers[driverID]
			if driverID == "" || !base.IsActive || base.RestDay == weekday {
				driverID = popFirstDriver(poolByID)
				isSubstitute = true
			}
			entry := core.NewRecord(entryCol)
			entry.Set("roster", roster.Id)
			entry.Set("unit", unit.ID)
			entry.Set("driver", driverID)
			entry.Set("departure_time", times[unit.ID])
			entry.Set("is_substitute", isSubstitute)
			if err := txApp.Save(entry); err != nil {
				return err
			}
			delete(poolByID, driverID)
		}

		remaining := make([]Driver, 0, len(poolByID))
		for _, d := range poolByID {
			d.RecentWorkDays = tx.countRecentWorkDays(d.ID, date)
			remaining = append(remaining, d)
		}
		standby := SelectStandby(remaining, 10)
		standbyCol, err := txApp.FindCollectionByNameOrId(StandbyEntriesCollection)
		if err != nil {
			return err
		}
		for i, d := range standby {
			row := core.NewRecord(standbyCol)
			row.Set("roster", roster.Id)
			row.Set("driver", d.ID)
			row.Set("position", i+1)
			if err := txApp.Save(row); err != nil {
				return err
			}
		}

		for _, unit := range units {
			rec, err := txApp.FindRecordById(UnitsCollection, unit.ID)
			if err != nil {
				return err
			}
			rec.Set("cycle_position", AdvanceCyclePosition(unit.CyclePosition, len(units)))
			if err := txApp.Save(rec); err != nil {
				return err
			}
		}
		created = roster
		return nil
	})
	return created, err
}

func (s *Service) PublishRoster(id string) (*core.Record, error) {
	roster, err := s.app.FindRecordById(DailyRostersCollection, id)
	if err != nil {
		return nil, err
	}
	entries, err := s.app.FindAllRecords(RosterEntriesCollection, dbx.HashExp{"roster": id})
	if err != nil {
		return nil, err
	}
	workCol, err := s.app.FindCollectionByNameOrId(WorkLogCollection)
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	for _, entry := range entries {
		if d := entry.GetString("driver"); d != "" {
			if seen[d] {
				return nil, errors.New("conductor asignado más de una vez en el rol")
			}
			seen[d] = true
		}
	}
	standbyCheck, err := s.app.FindAllRecords(StandbyEntriesCollection, dbx.HashExp{"roster": id})
	if err != nil {
		return nil, err
	}
	for _, se := range standbyCheck {
		if d := se.GetString("driver"); d != "" {
			if seen[d] {
				return nil, errors.New("conductor asignado más de una vez en el rol")
			}
			seen[d] = true
		}
	}

	for _, old := range mustRecords(s.app.FindAllRecords(WorkLogCollection, dbx.HashExp{"roster": id})) {
		_ = s.app.Delete(old)
	}
	for _, entry := range entries {
		if entry.GetString("driver") == "" {
			continue
		}
		log := core.NewRecord(workCol)
		log.Set("driver", entry.GetString("driver"))
		log.Set("date", roster.GetDateTime("date").Time())
		log.Set("roster", id)
		if err := s.app.Save(log); err != nil {
			return nil, err
		}
	}
	standbyEntries, err := s.app.FindAllRecords(StandbyEntriesCollection, dbx.HashExp{"roster": id})
	if err != nil {
		return nil, err
	}
	for _, se := range standbyEntries {
		driverID := se.GetString("driver")
		if driverID == "" {
			continue
		}
		wl := core.NewRecord(workCol)
		wl.Set("driver", driverID)
		wl.Set("date", roster.GetDateTime("date").Time())
		wl.Set("roster", id)
		if err := s.app.Save(wl); err != nil {
			return nil, err
		}
	}

	roster.Set("status", "published")
	roster.Set("published_at", time.Now().UTC())
	if err := s.app.Save(roster); err != nil {
		return nil, err
	}
	if err := s.SendRosterEmail(id); err != nil {
		s.app.Logger().Error("roster email failed", "roster", id, "error", err)
	}
	return roster, nil
}

func (s *Service) SendRosterEmail(id string) error {
	if os.Getenv("SMTP_HOST") == "" {
		s.app.Logger().Info("SMTP_HOST is not set; skipping roster email", "roster", id)
		return nil
	}
	s.applySMTPEnv()
	recipients, err := s.app.FindAllRecords(EmailRecipientsCollection, dbx.HashExp{"is_active": true})
	if err != nil {
		return err
	}
	if len(recipients) == 0 {
		return nil
	}
	data, filename, err := s.ExportRoster(id)
	if err != nil {
		return err
	}
	to := make([]mail.Address, 0, len(recipients))
	for _, r := range recipients {
		to = append(to, mail.Address{Name: r.GetString("name"), Address: r.GetString("email")})
	}
	from := mail.Address{Address: os.Getenv("SMTP_FROM_ADDRESS")}
	if from.Address == "" {
		from.Address = "no-reply@ruta13.local"
	}
	dateText := formattedSpanishDate(mustRosterDate(s.app, id))
	appURL := os.Getenv("APP_URL")
	if appURL == "" {
		appURL = "el sistema"
	}
	msg := &mailer.Message{
		From:        from,
		To:          to,
		Subject:     "Rol de Trabajo - " + dateText,
		Text:        "Se adjunta el Rol de Trabajo para el dia de manana. Si necesita hacer cambios, puede acceder al sistema en " + appURL + ".",
		Attachments: map[string]io.Reader{filename: bytes.NewReader(data)},
	}
	return s.app.NewMailClient().Send(msg)
}

func (s *Service) applySMTPEnv() {
	settings := s.app.Settings()
	settings.SMTP.Enabled = true
	settings.SMTP.Host = os.Getenv("SMTP_HOST")
	settings.SMTP.Username = os.Getenv("SMTP_USERNAME")
	settings.SMTP.Password = os.Getenv("SMTP_PASSWORD")
	if port, err := strconv.Atoi(os.Getenv("SMTP_PORT")); err == nil {
		settings.SMTP.Port = port
	}
}

func (s *Service) ExportRoster(id string) ([]byte, string, error) {
	roster, err := s.app.FindRecordById(DailyRostersCollection, id)
	if err != nil {
		return nil, "", err
	}
	entries, err := s.app.FindRecordsByFilter(RosterEntriesCollection, "roster={:roster}", "departure_time", 0, 0, dbx.Params{"roster": id})
	if err != nil {
		return nil, "", err
	}
	standby, err := s.app.FindRecordsByFilter(StandbyEntriesCollection, "roster={:roster}", "position", 0, 0, dbx.Params{"roster": id})
	if err != nil {
		return nil, "", err
	}

	f := excelize.NewFile()
	sheet := "Rol del Día"
	f.SetSheetName("Sheet1", sheet)
	f.SetCellValue(sheet, "A1", "Unidad")
	f.SetCellValue(sheet, "B1", "Conductor")
	f.SetCellValue(sheet, "C1", "Hora de Salida")
	f.SetCellValue(sheet, "D1", "Relevo")
	for i, e := range entries {
		row := i + 2
		unit := s.recordLabel(UnitsCollection, e.GetString("unit"), "number")
		driver := s.recordLabel(DriversCollection, e.GetString("driver"), "name")
		if e.GetBool("is_substitute") {
			driver = "(Relevo) " + driver
		}
		f.SetCellValue(sheet, fmt.Sprintf("A%d", row), unit)
		f.SetCellValue(sheet, fmt.Sprintf("B%d", row), driver)
		f.SetCellValue(sheet, fmt.Sprintf("C%d", row), e.GetString("departure_time"))
		f.SetCellValue(sheet, fmt.Sprintf("D%d", row), yesNo(e.GetBool("is_substitute")))
	}

	standbySheet := "Relevos de Presentación"
	f.NewSheet(standbySheet)
	f.SetCellValue(standbySheet, "A1", "#")
	f.SetCellValue(standbySheet, "B1", "Conductor")
	for i, e := range standby {
		row := i + 2
		f.SetCellValue(standbySheet, fmt.Sprintf("A%d", row), e.GetInt("position"))
		f.SetCellValue(standbySheet, fmt.Sprintf("B%d", row), s.recordLabel(DriversCollection, e.GetString("driver"), "name"))
	}
	buf, err := f.WriteToBuffer()
	if err != nil {
		return nil, "", err
	}
	date := roster.GetDateTime("date").Time().In(TijuanaLocation()).Format("2006-01-02")
	return buf.Bytes(), "Rol_" + date + ".xlsx", nil
}

func (s *Service) Alerts(now time.Time) ([]map[string]any, error) {
	alerts := []map[string]any{}
	units, err := s.app.FindAllRecords(UnitsCollection, dbx.HashExp{"status": "operational"})
	if err != nil {
		return nil, err
	}
	for _, u := range units {
		if u.GetString("base_driver") == "" {
			alerts = append(alerts, map[string]any{"type": "unit_no_driver", "unit_number": u.GetString("number")})
		}
	}
	if latest, err := s.app.FindRecordsByFilter(DailyRostersCollection, "", "-created", 1, 0); err == nil && len(latest) > 0 {
		standby, _ := s.app.FindAllRecords(StandbyEntriesCollection, dbx.HashExp{"roster": latest[0].Id})
		if len(standby) > 0 && len(standby) < 10 {
			alerts = append(alerts, map[string]any{
				"type":      "standby_shortage",
				"available": len(standby),
				"for_date":  latest[0].GetDateTime("date").Time().In(TijuanaLocation()).Format("2006-01-02"),
			})
		}
	}
	local := now.In(TijuanaLocation())
	if local.Hour() >= 19 {
		tomorrow := dayStart(local.AddDate(0, 0, 1))
		start, end := dayRange(tomorrow)
		_, err := s.app.FindFirstRecordByFilter(DailyRostersCollection, "date >= {:start} && date < {:end}", dbx.Params{"start": start, "end": end})
		if err != nil {
			alerts = append(alerts, map[string]any{"type": "roster_not_sent", "for_date": tomorrow.Format("2006-01-02")})
		}
	}
	return alerts, nil
}

func (s *Service) deleteRosterForDate(date time.Time) error {
	start, end := dayRange(date)
	existing, err := s.app.FindRecordsByFilter(DailyRostersCollection, "date >= {:start} && date < {:end}", "", 0, 0, dbx.Params{"start": start, "end": end})
	if err != nil {
		return err
	}
	for _, rosterRecord := range existing {
		for _, collection := range []string{RosterEntriesCollection, StandbyEntriesCollection, WorkLogCollection} {
			rows, err := s.app.FindAllRecords(collection, dbx.HashExp{"roster": rosterRecord.Id})
			if err != nil {
				return err
			}
			for _, row := range rows {
				if err := s.app.Delete(row); err != nil {
					return err
				}
			}
		}
		if err := s.app.Delete(rosterRecord); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) activeUnits() ([]Unit, error) {
	records, err := s.app.FindAllRecords(UnitsCollection, dbx.HashExp{"status": "operational"})
	if err != nil {
		return nil, err
	}
	units := make([]Unit, 0, len(records))
	for _, r := range records {
		units = append(units, Unit{ID: r.Id, Number: r.GetString("number"), Status: r.GetString("status"), BaseDriverID: r.GetString("base_driver"), CyclePosition: r.GetInt("cycle_position")})
	}
	return units, nil
}

func (s *Service) activeDriversByID() (map[string]Driver, error) {
	records, err := s.app.FindAllRecords(DriversCollection, dbx.HashExp{"is_active": true})
	if err != nil {
		return nil, err
	}
	out := map[string]Driver{}
	for _, r := range records {
		out[r.Id] = Driver{ID: r.Id, Name: r.GetString("name"), Type: r.GetString("type"), RestDay: r.GetString("rest_day"), IsActive: r.GetBool("is_active")}
	}
	return out, nil
}

func (s *Service) reliefPool(date time.Time, drivers map[string]Driver) ([]Driver, error) {
	weekday := WeekdayKey(date)
	pool := []Driver{}
	for _, d := range drivers {
		if d.Type == "relief" && d.RestDay != weekday {
			pool = append(pool, d)
		}
	}
	units, err := s.app.FindAllRecords(UnitsCollection, dbx.HashExp{"status": "in_shop"})
	if err != nil {
		return nil, err
	}
	seen := map[string]bool{}
	for _, d := range pool {
		seen[d.ID] = true
	}
	for _, u := range units {
		driverID := u.GetString("base_driver")
		d, ok := drivers[driverID]
		if ok && !seen[d.ID] && d.RestDay != weekday {
			pool = append(pool, d)
			seen[d.ID] = true
		}
	}
	sort.Slice(pool, func(i, j int) bool { return pool[i].Name < pool[j].Name })
	return pool, nil
}

func (s *Service) countRecentWorkDays(driverID string, date time.Time) int {
	start := dayStart(date).AddDate(0, 0, -60).Format("2006-01-02")
	rows, err := s.app.FindRecordsByFilter(WorkLogCollection, "driver={:driver} && date>={:start}", "", 0, 0, dbx.Params{"driver": driverID, "start": start})
	if err != nil {
		return 0
	}
	return len(rows)
}

func (s *Service) recordLabel(collection, id, field string) string {
	if id == "" {
		return ""
	}
	rec, err := s.app.FindRecordById(collection, id)
	if err != nil {
		return ""
	}
	return rec.GetString(field)
}

func popFirstDriver(pool map[string]Driver) string {
	if len(pool) == 0 {
		return ""
	}
	drivers := make([]Driver, 0, len(pool))
	for _, d := range pool {
		drivers = append(drivers, d)
	}
	sort.Slice(drivers, func(i, j int) bool { return drivers[i].Name < drivers[j].Name })
	return drivers[0].ID
}

func dayStart(t time.Time) time.Time {
	local := t.In(TijuanaLocation())
	return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, TijuanaLocation())
}

func dayRange(t time.Time) (time.Time, time.Time) {
	start := dayStart(t)
	return start.UTC(), start.AddDate(0, 0, 1).UTC()
}

func yesNo(v bool) string {
	if v {
		return "Si"
	}
	return "No"
}

func mustRecords(records []*core.Record, err error) []*core.Record {
	if err != nil {
		return nil
	}
	return records
}
func ValidateRole(auth *core.Record, roles ...string) error {
	if auth == nil {
		return errors.New("no autenticado")
	}
	role := auth.GetString("role")
	for _, allowed := range roles {
		if strings.EqualFold(role, allowed) {
			return nil
		}
	}
	return errors.New("sin permisos")
}

func mustRosterDate(app core.App, id string) time.Time {
	r, err := app.FindRecordById(DailyRostersCollection, id)
	if err != nil {
		return time.Now().In(TijuanaLocation())
	}
	return r.GetDateTime("date").Time().In(TijuanaLocation())
}

func formattedSpanishDate(t time.Time) string {
	days := []string{"Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"}
	months := []string{"Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"}
	local := t.In(TijuanaLocation())
	return fmt.Sprintf("%s %d de %s %d", days[local.Weekday()], local.Day(), months[int(local.Month())-1], local.Year())
}
