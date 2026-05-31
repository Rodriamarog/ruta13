package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	core.AppMigrations.Add(&core.Migration{
		Up: func(txApp core.App) error {
			staff := "@request.auth.role = 'admin' || @request.auth.role = 'supervisor'"
			never := "@request.auth.id = '__never__'"
			configs := map[string]struct{ create, update, del string }{
				"drivers":             {staff, staff, never},
				"units":               {staff, staff, staff},
				"email_recipients":    {staff, staff, staff},
				"unit_driver_history": {staff, staff, staff},
				"daily_rosters":       {staff, staff, staff},
				"roster_entries":      {staff, staff, staff},
				"standby_entries":     {staff, staff, staff},
				"work_log":            {staff, staff, staff},
			}
			for name, rules := range configs {
				col, err := txApp.FindCollectionByNameOrId(name)
				if err != nil {
					return err
				}
				col.ListRule = types.Pointer(staff)
				col.ViewRule = types.Pointer(staff)
				col.CreateRule = types.Pointer(rules.create)
				col.UpdateRule = types.Pointer(rules.update)
				col.DeleteRule = types.Pointer(rules.del)
				if err := txApp.Save(col); err != nil {
					return err
				}
			}
			return nil
		},
		Down: func(txApp core.App) error { return nil },
	})
}
