package roster

import (
	"net/http"
	"time"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/router"
)

func RegisterRoutes(app core.App, r *router.Router[*core.RequestEvent]) {
	service := NewService(app)

	r.POST("/api/roster/generate", func(e *core.RequestEvent) error {
		if err := ValidateRole(e.Auth, "admin", "supervisor"); err != nil {
			return e.ForbiddenError("No tienes permisos para generar el rol.", err)
		}
		body := struct {
			Date string `json:"date"`
		}{}
		if err := e.BindBody(&body); err != nil {
			return e.BadRequestError("Fecha invalida.", err)
		}
		date, err := time.ParseInLocation("2006-01-02", body.Date, TijuanaLocation())
		if err != nil {
			return e.BadRequestError("Fecha invalida.", err)
		}
		roster, err := service.GenerateRoster(date)
		if err != nil {
			return e.BadRequestError("No se pudo generar el rol.", err)
		}
		return e.JSON(http.StatusOK, RosterResult{RosterID: roster.Id, Status: roster.GetString("status")})
	})

	r.POST("/api/roster/{id}/publish", func(e *core.RequestEvent) error {
		if err := ValidateRole(e.Auth, "admin", "supervisor"); err != nil {
			return e.ForbiddenError("No tienes permisos para publicar el rol.", err)
		}
		roster, err := service.PublishRoster(e.Request.PathValue("id"))
		if err != nil {
			return e.BadRequestError("No se pudo publicar el rol.", err)
		}
		return e.JSON(http.StatusOK, map[string]any{"roster_id": roster.Id, "published_at": roster.Get("published_at")})
	})

	r.GET("/api/roster/{id}/export", func(e *core.RequestEvent) error {
		if err := ValidateRole(e.Auth, "admin", "supervisor"); err != nil {
			return e.ForbiddenError("No tienes permisos para descargar el rol.", err)
		}
		data, filename, err := service.ExportRoster(e.Request.PathValue("id"))
		if err != nil {
			return e.BadRequestError("No se pudo exportar el rol.", err)
		}
		e.Response.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
		e.Response.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
		e.Response.WriteHeader(http.StatusOK)
		_, err = e.Response.Write(data)
		return err
	})

	r.POST("/api/roster/{id}/email", func(e *core.RequestEvent) error {
		if err := ValidateRole(e.Auth, "admin", "supervisor"); err != nil {
			return e.ForbiddenError("No tienes permisos para reenviar correo.", err)
		}
		if err := service.SendRosterEmail(e.Request.PathValue("id")); err != nil {
			return e.BadRequestError("No se pudo reenviar el correo.", err)
		}
		return e.JSON(http.StatusOK, map[string]any{"ok": true})
	})

	r.GET("/api/dashboard/alerts", func(e *core.RequestEvent) error {
		if err := ValidateRole(e.Auth, "admin", "supervisor"); err != nil {
			return e.ForbiddenError("No tienes permisos para ver alertas.", err)
		}
		alerts, err := service.Alerts(time.Now())
		if err != nil {
			return e.BadRequestError("No se pudieron cargar las alertas.", err)
		}
		return e.JSON(http.StatusOK, map[string]any{"alerts": alerts})
	})
}
