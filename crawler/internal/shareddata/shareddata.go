// Package shareddata loads the data files shared with the TypeScript code
// (shared/data/*.json) so both languages use one source of truth.
package shareddata

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
)

// SkillDefinition mirrors one entry of shared/data/skills.json.
type SkillDefinition struct {
	ID              string   `json:"id"`
	Display         string   `json:"display"`
	Category        string   `json:"category"`
	Aliases         []string `json:"aliases"`
	Ambiguous       bool     `json:"ambiguous,omitempty"`
	ContextPatterns []string `json:"contextPatterns,omitempty"`
	Implies         []string `json:"implies,omitempty"`
}

// SkillDictionary mirrors shared/data/skills.json.
type SkillDictionary struct {
	Version string            `json:"version"`
	Skills  []SkillDefinition `json:"skills"`
}

// Locations mirrors shared/data/locations.json.
type Locations struct {
	Version   string `json:"version"`
	Countries []struct {
		Code  string   `json:"code"`
		Name  string   `json:"name"`
		Names []string `json:"names"`
	} `json:"countries"`
	Regions []struct {
		Country string   `json:"country"`
		Abbr    string   `json:"abbr,omitempty"`
		Names   []string `json:"names"`
	} `json:"regions"`
	Cities []struct {
		Country string   `json:"country"`
		Names   []string `json:"names"`
	} `json:"cities"`
}

// Data holds every shared data file.
type Data struct {
	Skills    SkillDictionary
	Locations Locations
	// Fold maps accented Latin letters to ASCII (shared/data/fold.json).
	Fold map[rune]string
}

// FindRoot walks up from start until it finds the repository root, identified
// by shared/data/skills.json.
func FindRoot(start string) (string, error) {
	dir, err := filepath.Abs(start)
	if err != nil {
		return "", err
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "shared", "data", "skills.json")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", errors.New("repository root not found: no shared/data/skills.json above " + start)
		}
		dir = parent
	}
}

// Load reads shared/data/*.json under the repository root.
func Load(root string) (*Data, error) {
	dataDir := filepath.Join(root, "shared", "data")
	var d Data
	if err := readJSON(filepath.Join(dataDir, "skills.json"), &d.Skills); err != nil {
		return nil, err
	}
	if err := readJSON(filepath.Join(dataDir, "locations.json"), &d.Locations); err != nil {
		return nil, err
	}
	var fold struct {
		Map map[string]string `json:"map"`
	}
	if err := readJSON(filepath.Join(dataDir, "fold.json"), &fold); err != nil {
		return nil, err
	}
	d.Fold = make(map[rune]string, len(fold.Map))
	for hex, ascii := range fold.Map {
		cp, err := strconv.ParseInt(hex, 16, 32)
		if err != nil {
			return nil, fmt.Errorf("fold.json: bad code point %q: %w", hex, err)
		}
		d.Fold[rune(cp)] = ascii
	}
	return &d, nil
}

func readJSON(path string, v any) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(raw, v); err != nil {
		return fmt.Errorf("%s: %w", path, err)
	}
	return nil
}
