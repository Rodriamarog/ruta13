package migrations

import "github.com/pocketbase/pocketbase/core"

func init() {
	core.AppMigrations.Add(&core.Migration{
		Up: func(txApp core.App) error {
			collection, err := txApp.FindCollectionByNameOrId("work_log")
			if err != nil {
				return err
			}
			field, _ := collection.Fields.GetByName("roster").(*core.RelationField)
			if field != nil {
				field.Required = false
			}
			return txApp.Save(collection)
		},
		Down: func(txApp core.App) error { return nil },
	})
}
