package roster

import (
	"math"
	"sort"
	"time"
)

const tijuanaTZ = "America/Tijuana"

type Unit struct {
	ID            string
	Number        string
	Status        string
	BaseDriverID  string
	CyclePosition int
}

type Driver struct {
	ID             string
	Name           string
	Type           string
	RestDay        string
	IsActive       bool
	RecentWorkDays int
}

type Entry struct {
	UnitID        string
	DriverID      string
	DepartureTime string
	IsSubstitute  bool
}

func TijuanaLocation() *time.Location {
	loc, err := time.LoadLocation(tijuanaTZ)
	if err != nil {
		return time.FixedZone("America/Tijuana", -8*60*60)
	}
	return loc
}

func WeekdayKey(t time.Time) string {
	switch t.In(TijuanaLocation()).Weekday() {
	case time.Monday:
		return "monday"
	case time.Tuesday:
		return "tuesday"
	case time.Wednesday:
		return "wednesday"
	case time.Thursday:
		return "thursday"
	case time.Friday:
		return "friday"
	case time.Saturday:
		return "saturday"
	default:
		return "sunday"
	}
}

func DepartureTimes(units []Unit) map[string]string {
	result := map[string]string{}
	if len(units) == 0 {
		return result
	}
	if len(units) == 1 {
		result[units[0].ID] = "05:00"
		return result
	}
	for _, u := range units {
		minutes := int(math.Round(float64(u.CyclePosition) * 150.0 / float64(len(units)-1)))
		departure := time.Date(2000, 1, 1, 5, 0, 0, 0, time.UTC).Add(time.Duration(minutes) * time.Minute)
		result[u.ID] = departure.Format("15:04")
	}
	return result
}

func AdvanceCyclePosition(position, totalActive int) int {
	if totalActive <= 1 {
		return 0
	}
	if position >= totalActive-1 {
		return 0
	}
	return position + 1
}

func SelectStandby(pool []Driver, limit int) []Driver {
	candidates := append([]Driver(nil), pool...)
	sort.SliceStable(candidates, func(i, j int) bool {
		if candidates[i].RecentWorkDays != candidates[j].RecentWorkDays {
			return candidates[i].RecentWorkDays < candidates[j].RecentWorkDays
		}
		return candidates[i].Name < candidates[j].Name
	})
	if len(candidates) < limit {
		return candidates
	}
	return candidates[:limit]
}
