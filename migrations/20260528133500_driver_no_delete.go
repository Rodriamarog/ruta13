package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	core.AppMigrations.Add(&core.Migration{
		Up: func(txApp core.App) error {
			collection, err := txApp.FindCollectionByNameOrId("drivers")
			if err != nil {
				return err
			}
			collection.DeleteRule = types.Pointer("@request.auth.id = '__never__'")
			return txApp.Save(collection)
		},
		Down: func(txApp core.App) error { return nil },
	})
}
