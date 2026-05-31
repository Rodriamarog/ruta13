package scheduler

import (
	"sync"
	"time"

	"ruta13/internal/roster"

	"github.com/pocketbase/pocketbase/core"
)

var once sync.Once

func Start(app core.App) {
	once.Do(func() {
		go func() {
			loc := roster.TijuanaLocation()
			for {
				now := time.Now().In(loc)
				next := time.Date(now.Year(), now.Month(), now.Day(), 18, 30, 0, 0, loc)
				if !now.Before(next) {
					next = next.AddDate(0, 0, 1)
				}
				time.Sleep(time.Until(next))
				tomorrow := time.Now().In(loc).AddDate(0, 0, 1)
				svc := roster.NewService(app)
				record, err := svc.GenerateRoster(tomorrow)
				if err == nil {
					_, err = svc.PublishRoster(record.Id)
				}
				if err != nil {
					app.Logger().Error("scheduled roster failed", "error", err)
				}
			}
		}()
	})
}
