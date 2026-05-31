package roster

import "testing"

func TestDepartureTimesSpanWindow(t *testing.T) {
	units := []Unit{{ID: "a", CyclePosition: 0}, {ID: "b", CyclePosition: 1}, {ID: "c", CyclePosition: 2}}
	times := DepartureTimes(units)
	if times["a"] != "05:00" || times["c"] != "07:30" || times["b"] != "06:15" {
		t.Fatalf("unexpected times: %#v", times)
	}
}

func TestDepartureTimesOneUnit(t *testing.T) {
	times := DepartureTimes([]Unit{{ID: "a", CyclePosition: 99}})
	if times["a"] != "05:00" {
		t.Fatalf("one unit should depart at 05:00, got %s", times["a"])
	}
}

func TestAdvanceCyclePosition(t *testing.T) {
	if got := AdvanceCyclePosition(0, 6); got != 1 {
		t.Fatalf("got %d", got)
	}
	if got := AdvanceCyclePosition(5, 6); got != 0 {
		t.Fatalf("got %d", got)
	}
	if got := AdvanceCyclePosition(4, 1); got != 0 {
		t.Fatalf("got %d", got)
	}
}

func TestSelectStandby(t *testing.T) {
	pool := []Driver{{Name: "Z", RecentWorkDays: 1}, {Name: "A", RecentWorkDays: 1}, {Name: "B", RecentWorkDays: 0}}
	selected := SelectStandby(pool, 2)
	if selected[0].Name != "B" || selected[1].Name != "A" {
		t.Fatalf("unexpected order: %#v", selected)
	}
}
