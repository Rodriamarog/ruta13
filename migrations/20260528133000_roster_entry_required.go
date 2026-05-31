package migrations

import "github.com/pocketbase/pocketbase/core"

func init() {
	core.AppMigrations.Add(&core.Migration{
		Up: func(txApp core.App) error {
			collection, err := txApp.FindCollectionByNameOrId("roster_entries")
			if err != nil {
				return err
			}
			field, _ := collection.Fields.GetByName("roster").(*core.RelationField)
			if field != nil {
				field.Required = true
			}
			return txApp.Save(collection)
		},
		Down: func(txApp core.App) error { return nil },
	})
}
