package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	core.AppMigrations.Add(&core.Migration{
		Up: func(txApp core.App) error {
			if err := ensureUsersRole(txApp); err != nil {
				return err
			}
			drivers, err := createBase(txApp, "drivers", func(c *core.Collection) {
				c.Fields.Add(&core.TextField{Name: "name", Required: true, Max: 255, Presentable: true})
				c.Fields.Add(&core.SelectField{Name: "type", Values: []string{"base", "relief"}, MaxSelect: 1, Required: true})
				c.Fields.Add(&core.SelectField{Name: "rest_day", Values: weekdays(), MaxSelect: 1})
				c.Fields.Add(&core.BoolField{Name: "is_active"})
				c.AddIndex("idx_drivers_name", false, "name", "")
			})
			if err != nil {
				return err
			}
			units, err := createBase(txApp, "units", func(c *core.Collection) {
				c.Fields.Add(&core.TextField{Name: "number", Required: true, Max: 40, Presentable: true})
				c.Fields.Add(&core.SelectField{Name: "status", Values: []string{"operational", "in_shop"}, MaxSelect: 1, Required: true})
				c.Fields.Add(&core.RelationField{Name: "base_driver", CollectionId: drivers.Id, MaxSelect: 1})
				c.Fields.Add(&core.NumberField{Name: "cycle_position", OnlyInt: true, Min: types.Pointer(0.0)})
				c.AddIndex("idx_units_number", true, "number", "")
				c.AddIndex("idx_units_base_driver_unique", true, "base_driver", "base_driver != ''")
			})
			if err != nil {
				return err
			}
			rosters, err := createBase(txApp, "daily_rosters", func(c *core.Collection) {
				c.Fields.Add(&core.DateField{Name: "date", Required: true})
				c.Fields.Add(&core.SelectField{Name: "status", Values: []string{"draft", "published"}, MaxSelect: 1, Required: true})
				c.Fields.Add(&core.DateField{Name: "published_at"})
				c.AddIndex("idx_daily_rosters_date", true, "date", "")
			})
			if err != nil {
				return err
			}
			if _, err := createBase(txApp, "roster_entries", func(c *core.Collection) {
				c.Fields.Add(&core.RelationField{Name: "roster", CollectionId: rosters.Id, MaxSelect: 1, Required: true, CascadeDelete: true})
				c.Fields.Add(&core.RelationField{Name: "unit", CollectionId: units.Id, MaxSelect: 1, Required: true})
				c.Fields.Add(&core.RelationField{Name: "driver", CollectionId: drivers.Id, MaxSelect: 1})
				c.Fields.Add(&core.BoolField{Name: "is_substitute"})
				c.Fields.Add(&core.TextField{Name: "departure_time", Required: true, Max: 5})
				c.AddIndex("idx_roster_entries_roster_unit", true, "roster, unit", "")
			}); err != nil {
				return err
			}
			if _, err := createBase(txApp, "standby_entries", func(c *core.Collection) {
				c.Fields.Add(&core.RelationField{Name: "roster", CollectionId: rosters.Id, MaxSelect: 1, Required: true, CascadeDelete: true})
				c.Fields.Add(&core.RelationField{Name: "driver", CollectionId: drivers.Id, MaxSelect: 1, Required: true})
				c.Fields.Add(&core.NumberField{Name: "position", Required: true, OnlyInt: true, Min: types.Pointer(1.0)})
				c.AddIndex("idx_standby_roster_position", true, "roster, position", "")
			}); err != nil {
				return err
			}
			if _, err := createBase(txApp, "work_log", func(c *core.Collection) {
				c.Fields.Add(&core.RelationField{Name: "driver", CollectionId: drivers.Id, MaxSelect: 1, Required: true})
				c.Fields.Add(&core.DateField{Name: "date", Required: true})
				c.Fields.Add(&core.RelationField{Name: "roster", CollectionId: rosters.Id, MaxSelect: 1, Required: true, CascadeDelete: true})
				c.AddIndex("idx_work_log_driver_date", false, "driver, date", "")
			}); err != nil {
				return err
			}
			if _, err := createBase(txApp, "unit_driver_history", func(c *core.Collection) {
				c.Fields.Add(&core.RelationField{Name: "unit", CollectionId: units.Id, MaxSelect: 1, Required: true})
				c.Fields.Add(&core.RelationField{Name: "driver", CollectionId: drivers.Id, MaxSelect: 1, Required: true})
				c.Fields.Add(&core.DateField{Name: "assigned_at", Required: true})
				c.Fields.Add(&core.DateField{Name: "unassigned_at"})
			}); err != nil {
				return err
			}
			_, err = createBase(txApp, "email_recipients", func(c *core.Collection) {
				c.Fields.Add(&core.TextField{Name: "email", Required: true, Max: 255, Presentable: true})
				c.Fields.Add(&core.TextField{Name: "name", Max: 255})
				c.Fields.Add(&core.BoolField{Name: "is_active"})
				c.AddIndex("idx_email_recipients_email", true, "email", "")
			})
			return err
		},
		Down: func(txApp core.App) error {
			for _, name := range []string{"email_recipients", "unit_driver_history", "work_log", "standby_entries", "roster_entries", "daily_rosters", "units", "drivers"} {
				c, err := txApp.FindCollectionByNameOrId(name)
				if err == nil {
					if err := txApp.Delete(c); err != nil {
						return err
					}
				}
			}
			return nil
		},
	})
}

func createBase(txApp core.App, name string, configure func(*core.Collection)) (*core.Collection, error) {
	if existing, err := txApp.FindCollectionByNameOrId(name); err == nil {
		return existing, nil
	}
	c := core.NewBaseCollection(name)
	rule := "@request.auth.id != ''"
	admin := "@request.auth.role = 'admin'"
	c.ListRule = types.Pointer(rule)
	c.ViewRule = types.Pointer(rule)
	c.CreateRule = types.Pointer(rule)
	c.UpdateRule = types.Pointer(rule)
	c.DeleteRule = types.Pointer(admin)
	configure(c)
	return c, txApp.Save(c)
}

func ensureUsersRole(txApp core.App) error {
	users, err := txApp.FindCollectionByNameOrId("users")
	if err != nil {
		return err
	}
	if users.Fields.GetByName("role") == nil {
		users.Fields.Add(&core.SelectField{Name: "role", Values: []string{"admin", "supervisor"}, MaxSelect: 1, Required: true})
	}
	return txApp.Save(users)
}

func weekdays() []string {
	return []string{"monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"}
}
