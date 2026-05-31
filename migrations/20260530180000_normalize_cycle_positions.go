package migrations

import (
	"sort"
	"strconv"

	"github.com/pocketbase/pocketbase/core"
)

func init() {
	core.AppMigrations.Add(&core.Migration{
		Up: func(txApp core.App) error {
			units, err := txApp.FindAllRecords("units", nil)
			if err != nil {
				return err
			}
			sort.Slice(units, func(i, j int) bool {
				a, _ := strconv.Atoi(units[i].GetString("number"))
				b, _ := strconv.Atoi(units[j].GetString("number"))
				return a < b
			})
			for i, u := range units {
				u.Set("cycle_position", i)
				if err := txApp.Save(u); err != nil {
					return err
				}
			}
			return nil
		},
		Down: func(txApp core.App) error { return nil },
	})
}
