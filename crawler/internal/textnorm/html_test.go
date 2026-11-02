package textnorm_test

import (
	"testing"

	"github.com/Nitish2185/Job-copilot/crawler/internal/testutil"
	"github.com/Nitish2185/Job-copilot/crawler/internal/textnorm"
)

func TestHTMLToTextGoldenCases(t *testing.T) {
	type htmlCase struct {
		HTML string `json:"html"`
		Text string `json:"text"`
	}
	for _, c := range testutil.GoldenCases[htmlCase](t, "html.cases.json") {
		if got := textnorm.HTMLToText(c.HTML); got != c.Text {
			t.Errorf("HTMLToText(%q)\n got %q\nwant %q", c.HTML, got, c.Text)
		}
	}
}

func TestPlainText(t *testing.T) {
	got := textnorm.PlainText("A  World\r\n \r\n Changing\tCompany ")
	if got != "A World\nChanging Company" {
		t.Errorf("PlainText = %q", got)
	}
}
