package main

import (
	"log"
	"os"
	"path/filepath"

	"ruta13/internal/roster"
	"ruta13/internal/scheduler"
	"ruta13/internal/seed"
	_ "ruta13/migrations"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
	"github.com/pocketbase/pocketbase/tools/osutils"
)

func main() {
	app := pocketbase.New()

	var publicDir string
	var seedDev bool
	app.RootCmd.PersistentFlags().StringVar(&publicDir, "publicDir", defaultPublicDir(), "directory for the built frontend")
	app.RootCmd.PersistentFlags().BoolVar(&seedDev, "seedDev", false, "seed development data when collections are empty")

	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{Automigrate: true})
	registerHooks(app)

	app.OnBootstrap().BindFunc(func(e *core.BootstrapEvent) error {
		if err := e.Next(); err != nil {
			return err
		}
		if seedDev {
			if err := seed.Ensure(e.App); err != nil {
				e.App.Logger().Error("seed failed", "error", err)
			}
		}
		scheduler.Start(e.App)
		return nil
	})

	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		roster.RegisterRoutes(e.App, e.Router)
		e.Router.GET("/{path...}", apis.Static(os.DirFS(publicDir), true))
		return e.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}

func defaultPublicDir() string {
	if osutils.IsProbablyGoRun() {
		return "./pb_public"
	}
	return filepath.Join(os.Args[0], "../pb_public")
}
