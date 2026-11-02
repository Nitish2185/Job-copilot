// Package httpx is a polite HTTP client for public job-board APIs (spec 7.6):
// a clear User-Agent, global and per-host concurrency limits, per-request
// timeouts, and retries with exponential backoff that honor Retry-After.
package httpx

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math/rand/v2"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/semaphore"
)

// Options configure a Client. Zero values use the spec defaults.
type Options struct {
	UserAgent     string
	GlobalLimit   int64         // default 8
	PerHostLimit  int64         // default 2
	Timeout       time.Duration // per request, default 20s
	MaxRetries    int           // default 3
	BaseDelay     time.Duration // default 1s
	MaxDelay      time.Duration // default 30s
	MaxRetryAfter time.Duration // cap on Retry-After, default 2m
	MaxBodyBytes  int64         // default 64 MiB
	HTTPClient    *http.Client
	Logger        *slog.Logger
	Sleep         func(ctx context.Context, d time.Duration) error // for tests
	DisableJitter bool                                             // for tests
}

// StatusError is returned for non-2xx responses after retries.
type StatusError struct {
	URL        string
	StatusCode int
}

func (e *StatusError) Error() string {
	return fmt.Sprintf("GET %s: HTTP %d", e.URL, e.StatusCode)
}

// IsNotFound reports a 404 (a company that moved or closed its board).
func IsNotFound(err error) bool {
	var se *StatusError
	return errors.As(err, &se) && se.StatusCode == http.StatusNotFound
}

// Client is safe for concurrent use.
type Client struct {
	opts    Options
	global  *semaphore.Weighted
	mu      sync.Mutex
	perHost map[string]*semaphore.Weighted
}

// New builds a Client.
func New(opts Options) *Client {
	if opts.GlobalLimit == 0 {
		opts.GlobalLimit = 8
	}
	if opts.PerHostLimit == 0 {
		opts.PerHostLimit = 2
	}
	if opts.Timeout == 0 {
		opts.Timeout = 20 * time.Second
	}
	if opts.MaxRetries == 0 {
		opts.MaxRetries = 3
	}
	if opts.BaseDelay == 0 {
		opts.BaseDelay = time.Second
	}
	if opts.MaxDelay == 0 {
		opts.MaxDelay = 30 * time.Second
	}
	if opts.MaxRetryAfter == 0 {
		opts.MaxRetryAfter = 2 * time.Minute
	}
	if opts.MaxBodyBytes == 0 {
		opts.MaxBodyBytes = 64 << 20
	}
	if opts.HTTPClient == nil {
		opts.HTTPClient = &http.Client{}
	}
	if opts.Logger == nil {
		opts.Logger = slog.New(slog.DiscardHandler)
	}
	if opts.Sleep == nil {
		opts.Sleep = sleepContext
	}
	return &Client{
		opts:    opts,
		global:  semaphore.NewWeighted(opts.GlobalLimit),
		perHost: map[string]*semaphore.Weighted{},
	}
}

func sleepContext(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}

func (c *Client) hostLimit(host string) *semaphore.Weighted {
	c.mu.Lock()
	defer c.mu.Unlock()
	s, ok := c.perHost[host]
	if !ok {
		s = semaphore.NewWeighted(c.opts.PerHostLimit)
		c.perHost[host] = s
	}
	return s
}

// Get fetches a URL and returns the body, retrying transient failures.
func (c *Client) Get(ctx context.Context, rawURL string) ([]byte, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil, err
	}
	var lastErr error
	for attempt := 0; ; attempt++ {
		body, retryAfter, err := c.attempt(ctx, u)
		if err == nil {
			return body, nil
		}
		lastErr = err
		if !retryable(err) || attempt >= c.opts.MaxRetries || ctx.Err() != nil {
			return nil, lastErr
		}
		delay := c.backoff(attempt)
		if retryAfter > 0 {
			delay = min(retryAfter, c.opts.MaxRetryAfter)
		}
		c.opts.Logger.Debug("retrying", "url", rawURL, "attempt", attempt+1, "delay", delay, "error", err)
		if err := c.opts.Sleep(ctx, delay); err != nil {
			return nil, err
		}
	}
}

// GetJSON fetches a URL and decodes the JSON body into v.
func (c *Client) GetJSON(ctx context.Context, rawURL string, v any) error {
	body, err := c.Get(ctx, rawURL)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(body, v); err != nil {
		return fmt.Errorf("GET %s: decode JSON: %w", rawURL, err)
	}
	return nil
}

func (c *Client) attempt(ctx context.Context, u *url.URL) ([]byte, time.Duration, error) {
	host := strings.ToLower(u.Host)
	if err := c.global.Acquire(ctx, 1); err != nil {
		return nil, 0, err
	}
	defer c.global.Release(1)
	hostSem := c.hostLimit(host)
	if err := hostSem.Acquire(ctx, 1); err != nil {
		return nil, 0, err
	}
	defer hostSem.Release(1)

	reqCtx, cancel := context.WithTimeout(ctx, c.opts.Timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("User-Agent", c.opts.UserAgent)
	req.Header.Set("Accept", "application/json")

	resp, err := c.opts.HTTPClient.Do(req)
	if err != nil {
		return nil, 0, &transientError{err}
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<16))
		statusErr := &StatusError{URL: u.String(), StatusCode: resp.StatusCode}
		if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500 {
			return nil, parseRetryAfter(resp.Header.Get("Retry-After"), time.Now()), &transientError{statusErr}
		}
		return nil, 0, statusErr
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, c.opts.MaxBodyBytes+1))
	if err != nil {
		return nil, 0, &transientError{err}
	}
	if int64(len(body)) > c.opts.MaxBodyBytes {
		return nil, 0, fmt.Errorf("GET %s: response larger than %d bytes", u, c.opts.MaxBodyBytes)
	}
	return body, 0, nil
}

// transientError marks failures worth retrying: network errors, timeouts, 429, 5xx.
type transientError struct{ err error }

func (e *transientError) Error() string { return e.err.Error() }
func (e *transientError) Unwrap() error { return e.err }

func retryable(err error) bool {
	var te *transientError
	return errors.As(err, &te)
}

func (c *Client) backoff(attempt int) time.Duration {
	d := c.opts.BaseDelay << attempt
	if d > c.opts.MaxDelay || d <= 0 {
		d = c.opts.MaxDelay
	}
	if !c.opts.DisableJitter {
		d += time.Duration(rand.Int64N(int64(c.opts.BaseDelay)))
	}
	return d
}

// parseRetryAfter accepts delta-seconds or an HTTP date; 0 means absent.
func parseRetryAfter(v string, now time.Time) time.Duration {
	v = strings.TrimSpace(v)
	if v == "" {
		return 0
	}
	if secs, err := strconv.Atoi(v); err == nil && secs >= 0 {
		return time.Duration(secs) * time.Second
	}
	if t, err := http.ParseTime(v); err == nil {
		if d := t.Sub(now); d > 0 {
			return d
		}
	}
	return 0
}
