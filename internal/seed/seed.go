package seed

import (
	"fmt"
	"os"
	"time"

	"ruta13/internal/roster"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

func Ensure(app core.App) error {
	driverCount, err := count(app, roster.DriversCollection)
	if err != nil {
		return err
	}
	if err := ensureUsers(app); err != nil {
		return err
	}
	if driverCount > 0 {
		return ensureWorkLogs(app)
	}
	if err := seedDomain(app); err != nil {
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

func seedDomain(app core.App) error {
	drivers, err := app.FindCollectionByNameOrId(roster.DriversCollection)
	if err != nil {
		return err
	}
	units, err := app.FindCollectionByNameOrId(roster.UnitsCollection)
	if err != nil {
		return err
	}
	emails, err := app.FindCollectionByNameOrId(roster.EmailRecipientsCollection)
	if err != nil {
		return err
	}
	baseIDs := []string{}
	weekdays := []string{"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"}
	for i := 1; i <= 10; i++ {
		rec := core.NewRecord(drivers)
		rec.Set("name", fmt.Sprintf("Conductor Base %02d", i))
		rec.Set("type", "base")
		rec.Set("rest_day", weekdays[(i-1)%len(weekdays)])
		rec.Set("is_active", true)
		if err := app.Save(rec); err != nil {
			return err
		}
		baseIDs = append(baseIDs, rec.Id)
	}
	reliefIDs := []string{}
	for i := 1; i <= 5; i++ {
		rec := core.NewRecord(drivers)
		rec.Set("name", fmt.Sprintf("Relevo %02d", i))
		rec.Set("type", "relief")
		rec.Set("rest_day", "")
		rec.Set("is_active", true)
		if err := app.Save(rec); err != nil {
			return err
		}
		reliefIDs = append(reliefIDs, rec.Id)
	}
	for i := 0; i < 8; i++ {
		rec := core.NewRecord(units)
		rec.Set("number", fmt.Sprintf("%d", 400+i*2))
		if i < 6 {
			rec.Set("status", "operational")
		} else {
			rec.Set("status", "in_shop")
		}
		rec.Set("base_driver", baseIDs[i])
		rec.Set("cycle_position", i%6)
		if err := app.Save(rec); err != nil {
			return err
		}
	}
	recipient := core.NewRecord(emails)
	recipient.Set("email", "supervisor@ruta13.local")
	recipient.Set("name", "Supervisor")
	recipient.Set("is_active", true)
	if err := app.Save(recipient); err != nil {
		return err
	}

	return nil
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
