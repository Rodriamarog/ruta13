package main

import (
	"log"

	"ruta13/internal/seed"
	_ "ruta13/migrations"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
)

func main() {
	app := pocketbase.New()
	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{Automigrate: true})
	if err := app.Bootstrap(); err != nil {
		log.Fatal("bootstrap:", err)
	}
	if err := seed.Ensure(app); err != nil {
		log.Fatal("seed:", err)
	}
	log.Println("seed complete")
}
