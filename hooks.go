package main

import (
	"time"

	"ruta13/internal/roster"

	"github.com/pocketbase/pocketbase/core"
)

func registerHooks(app core.App) {
	app.OnRecordCreateRequest(roster.UnitsCollection).BindFunc(func(e *core.RecordRequestEvent) error {
		if err := e.Next(); err != nil {
			return err
		}
		newBase := e.Record.GetString("base_driver")
		if newBase == "" {
			return nil
		}
		col, err := e.App.FindCollectionByNameOrId(roster.UnitDriverHistory)
		if err != nil {
			return err
		}
		h := core.NewRecord(col)
		h.Set("unit", e.Record.Id)
		h.Set("driver", newBase)
		h.Set("assigned_at", time.Now().UTC())
		return e.App.Save(h)
	})

	app.OnRecordUpdateRequest(roster.UnitsCollection).BindFunc(func(e *core.RecordRequestEvent) error {
		oldBase := ""
		if existing, err := e.App.FindRecordById(roster.UnitsCollection, e.Record.Id); err == nil {
			oldBase = existing.GetString("base_driver")
		}
		if err := e.Next(); err != nil {
			return err
		}
		newBase := e.Record.GetString("base_driver")
		if oldBase == newBase {
			return nil
		}
		now := time.Now().UTC()
		if oldBase != "" {
			openRows, _ := e.App.FindRecordsByFilter(roster.UnitDriverHistory, "unit={:unit} && unassigned_at=''", "-assigned_at", 1, 0, map[string]any{"unit": e.Record.Id})
			for _, row := range openRows {
				row.Set("unassigned_at", now)
				_ = e.App.Save(row)
			}
		}
		if newBase != "" {
			col, err := e.App.FindCollectionByNameOrId(roster.UnitDriverHistory)
			if err != nil {
				return err
			}
			h := core.NewRecord(col)
			h.Set("unit", e.Record.Id)
			h.Set("driver", newBase)
			h.Set("assigned_at", now)
			return e.App.Save(h)
		}
		return nil
	})
}
