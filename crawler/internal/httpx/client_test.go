package httpx

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type recordedSleeps struct {
	mu     sync.Mutex
	delays []time.Duration
}

func (r *recordedSleeps) sleep(_ context.Context, d time.Duration) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.delays = append(r.delays, d)
	return nil
}

func newTestClient(sleeps *recordedSleeps) *Client {
	return New(Options{UserAgent: "TestAgent/1.0", Sleep: sleeps.sleep, DisableJitter: true})
}

func TestSendsUserAgent(t *testing.T) {
	var got string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Get("User-Agent")
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer srv.Close()

	var v struct{ OK bool }
	if err := newTestClient(&recordedSleeps{}).GetJSON(context.Background(), srv.URL, &v); err != nil {
		t.Fatal(err)
	}
	if got != "TestAgent/1.0" || !v.OK {
		t.Fatalf("User-Agent %q, body ok=%v", got, v.OK)
	}
}

func TestRetriesServerErrorsWithBackoff(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if calls.Add(1) < 3 {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		_, _ = w.Write([]byte(`ok`))
	}))
	defer srv.Close()

	sleeps := &recordedSleeps{}
	body, err := newTestClient(sleeps).Get(context.Background(), srv.URL)
	if err != nil || string(body) != "ok" {
		t.Fatalf("body %q err %v", body, err)
	}
	if calls.Load() != 3 {
		t.Fatalf("calls = %d, want 3", calls.Load())
	}
	want := []time.Duration{time.Second, 2 * time.Second}
	if len(sleeps.delays) != 2 || sleeps.delays[0] != want[0] || sleeps.delays[1] != want[1] {
		t.Fatalf("delays = %v, want %v", sleeps.delays, want)
	}
}

func TestHonorsRetryAfterOn429(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if calls.Add(1) == 1 {
			w.Header().Set("Retry-After", "7")
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		_, _ = w.Write([]byte(`ok`))
	}))
	defer srv.Close()

	sleeps := &recordedSleeps{}
	if _, err := newTestClient(sleeps).Get(context.Background(), srv.URL); err != nil {
		t.Fatal(err)
	}
	if len(sleeps.delays) != 1 || sleeps.delays[0] != 7*time.Second {
		t.Fatalf("delays = %v, want [7s]", sleeps.delays)
	}
}

func TestGivesUpAfterThreeRetries(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusBadGateway)
	}))
	defer srv.Close()

	_, err := newTestClient(&recordedSleeps{}).Get(context.Background(), srv.URL)
	if err == nil {
		t.Fatal("want error")
	}
	if calls.Load() != 4 {
		t.Fatalf("calls = %d, want 1 + 3 retries", calls.Load())
	}
}

func TestDoesNotRetry404(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	_, err := newTestClient(&recordedSleeps{}).Get(context.Background(), srv.URL)
	if !IsNotFound(err) {
		t.Fatalf("err = %v, want not found", err)
	}
	if calls.Load() != 1 {
		t.Fatalf("calls = %d, want 1", calls.Load())
	}
}

func TestRetriesTimeouts(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if calls.Add(1) == 1 {
			<-r.Context().Done()
			return
		}
		_, _ = w.Write([]byte(`ok`))
	}))
	defer srv.Close()

	sleeps := &recordedSleeps{}
	c := New(Options{UserAgent: "T", Timeout: 50 * time.Millisecond, Sleep: sleeps.sleep, DisableJitter: true})
	if _, err := c.Get(context.Background(), srv.URL); err != nil {
		t.Fatal(err)
	}
	if calls.Load() != 2 {
		t.Fatalf("calls = %d, want 2", calls.Load())
	}
}

func TestLimitsConcurrencyPerHost(t *testing.T) {
	var current, peak atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		n := current.Add(1)
		for {
			p := peak.Load()
			if n <= p || peak.CompareAndSwap(p, n) {
				break
			}
		}
		time.Sleep(20 * time.Millisecond)
		current.Add(-1)
		_, _ = w.Write([]byte(`ok`))
	}))
	defer srv.Close()

	c := newTestClient(&recordedSleeps{})
	var wg sync.WaitGroup
	for range 10 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _ = c.Get(context.Background(), srv.URL)
		}()
	}
	wg.Wait()
	if peak.Load() > 2 {
		t.Fatalf("peak concurrency per host = %d, want <= 2", peak.Load())
	}
}

func TestParseRetryAfter(t *testing.T) {
	now := time.Date(2026, 11, 2, 6, 0, 0, 0, time.UTC)
	if d := parseRetryAfter("120", now); d != 2*time.Minute {
		t.Errorf("seconds: %v", d)
	}
	if d := parseRetryAfter(now.Add(30*time.Second).Format(http.TimeFormat), now); d != 30*time.Second {
		t.Errorf("http date: %v", d)
	}
	if d := parseRetryAfter("soon", now); d != 0 {
		t.Errorf("garbage: %v", d)
	}
}
