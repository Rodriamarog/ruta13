package seed

import (
	"fmt"
	"os"
	"sort"
	"strconv"
	"time"

	"ruta13/internal/roster"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

const (
	targetBase   = 80
	targetRelief = 35
	targetUnits  = 77
)

func Ensure(app core.App) error {
	if err := ensureUsers(app); err != nil {
		return err
	}
	if err := ensureDrivers(app); err != nil {
		return err
	}
	if err := ensureUnits(app); err != nil {
		return err
	}
	if err := ensureEmailRecipient(app); err != nil {
		return err
	}
	return ensureWorkLogs(app)
}

func ensureUsers(app core.App) error {
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return err
	}
	accounts := []struct{ email, name, role, password, env string }{
		{"admin@ruta13.local", "Administrador", "admin", "Ruta13Admin123!", "RUTA13_DEV_ADMIN_PASSWORD"},
		{"supervisor@ruta13.local", "Supervisor", "supervisor", "Ruta13Supervisor123!", "RUTA13_DEV_SUPERVISOR_PASSWORD"},
	}
	for _, a := range accounts {
		if _, err := app.FindAuthRecordByEmail("users", a.email); err == nil {
			continue
		}
		rec := core.NewRecord(users)
		rec.SetEmail(a.email)
		rec.SetEmailVisibility(true)
		rec.SetVerified(true)
		rec.Set("name", a.name)
		rec.Set("role", a.role)
		pass := os.Getenv(a.env)
		if pass == "" {
			pass = a.password
		}
		rec.SetPassword(pass)
		if err := app.Save(rec); err != nil {
			return err
		}
	}
	return nil
}

func ensureDrivers(app core.App) error {
	col, err := app.FindCollectionByNameOrId(roster.DriversCollection)
	if err != nil {
		return err
	}
	weekdays := []string{"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"}

	// Base drivers
	baseDrivers, err := app.FindAllRecords(roster.DriversCollection, dbx.HashExp{"type": "base"})
	if err != nil {
		return err
	}
	maxBase := 0
	for _, d := range baseDrivers {
		n := 0
		fmt.Sscanf(d.GetString("name"), "Conductor Base %d", &n)
		if n > maxBase {
			maxBase = n
		}
	}
	for len(baseDrivers) < targetBase {
		maxBase++
		rec := core.NewRecord(col)
		rec.Set("name", fmt.Sprintf("Conductor Base %02d", maxBase))
		rec.Set("type", "base")
		rec.Set("rest_day", weekdays[(maxBase-1)%len(weekdays)])
		rec.Set("is_active", true)
		if err := app.Save(rec); err != nil {
			return err
		}
		baseDrivers = append(baseDrivers, rec)
	}

	// Relief drivers
	reliefDrivers, err := app.FindAllRecords(roster.DriversCollection, dbx.HashExp{"type": "relief"})
	if err != nil {
		return err
	}
	maxRelief := 0
	for _, d := range reliefDrivers {
		n := 0
		fmt.Sscanf(d.GetString("name"), "Relevo %d", &n)
		if n > maxRelief {
			maxRelief = n
		}
	}
	for len(reliefDrivers) < targetRelief {
		maxRelief++
		rec := core.NewRecord(col)
		rec.Set("name", fmt.Sprintf("Relevo %02d", maxRelief))
		rec.Set("type", "relief")
		rec.Set("rest_day", "")
		rec.Set("is_active", true)
		if err := app.Save(rec); err != nil {
			return err
		}
		reliefDrivers = append(reliefDrivers, rec)
	}

	return nil
}

func ensureUnits(app core.App) error {
	col, err := app.FindCollectionByNameOrId(roster.UnitsCollection)
	if err != nil {
		return err
	}

	existingUnits, err := app.FindAllRecords(roster.UnitsCollection, dbx.NewExp("1=1"))
	if err != nil {
		return err
	}
	if len(existingUnits) >= targetUnits {
		return nil
	}

	// Find highest unit number to continue the sequence
	maxNum := 0
	assignedDriverIDs := map[string]bool{}
	for _, u := range existingUnits {
		n, _ := strconv.Atoi(u.GetString("number"))
		if n > maxNum {
			maxNum = n
		}
		if d := u.GetString("base_driver"); d != "" {
			assignedDriverIDs[d] = true
		}
	}
	if maxNum == 0 {
		maxNum = 398
	}

	// Collect unassigned base drivers sorted by name
	allBase, err := app.FindAllRecords(roster.DriversCollection, dbx.HashExp{"type": "base", "is_active": true})
	if err != nil {
		return err
	}
	sort.Slice(allBase, func(i, j int) bool {
		return allBase[i].GetString("name") < allBase[j].GetString("name")
	})
	unassigned := make([]*core.Record, 0)
	for _, d := range allBase {
		if !assignedDriverIDs[d.Id] {
			unassigned = append(unassigned, d)
		}
	}

	toAdd := targetUnits - len(existingUnits)
	offset := len(existingUnits)
	for i := 0; i < toAdd; i++ {
		maxNum += 2
		rec := core.NewRecord(col)
		rec.Set("number", fmt.Sprintf("%d", maxNum))
		rec.Set("status", "operational")
		rec.Set("cycle_position", offset+i)
		if i < len(unassigned) {
			rec.Set("base_driver", unassigned[i].Id)
		}
		if err := app.Save(rec); err != nil {
			return err
		}
	}
	return nil
}

func ensureEmailRecipient(app core.App) error {
	existing, err := app.FindAllRecords(roster.EmailRecipientsCollection, dbx.NewExp("1=1"))
	if err != nil || len(existing) > 0 {
		return err
	}
	col, err := app.FindCollectionByNameOrId(roster.EmailRecipientsCollection)
	if err != nil {
		return err
	}
	rec := core.NewRecord(col)
	rec.Set("email", "supervisor@ruta13.local")
	rec.Set("name", "Supervisor")
	rec.Set("is_active", true)
	return app.Save(rec)
}

func ensureWorkLogs(app core.App) error {
	existing, err := count(app, roster.WorkLogCollection)
	if err != nil || existing > 0 {
		return err
	}
	workLogs, err := app.FindCollectionByNameOrId(roster.WorkLogCollection)
	if err != nil {
		return err
	}
	drivers, err := app.FindAllRecords(roster.DriversCollection, dbx.HashExp{"is_active": true})
	if err != nil {
		return err
	}
	today := time.Now().In(roster.TijuanaLocation())
	for day := 1; day <= 30; day++ {
		for i, driver := range drivers {
			if (day+i)%3 == 0 {
				log := core.NewRecord(workLogs)
				log.Set("driver", driver.Id)
				log.Set("date", today.AddDate(0, 0, -day))
				if err := app.Save(log); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func count(app core.App, collection string) (int, error) {
	rows, err := app.FindAllRecords(collection, dbx.NewExp("1=1"))
	if err != nil {
		return 0, err
	}
	return len(rows), nil
}
