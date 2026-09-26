"""Fails if blindspot/config.py drifts from the parameters committed in PREREGISTRATION.md."""
import re

from blindspot import config


def prereg_params():
    text = (config.ROOT / "PREREGISTRATION.md").read_text(encoding="utf-8")
    section = text.split("## 8. Parameters", 1)[1].split("```", 2)[1]
    params = {}
    for line in section.strip().splitlines():
        name, value = (part.strip() for part in line.split("=", 1))
        params[name] = float(value) if "." in value else int(value)
    return params


def test_config_matches_preregistration():
    params = prereg_params()
    assert params, "no parameters found in PREREGISTRATION.md"
    for name, value in params.items():
        assert getattr(config, name) == value, f"{name}: config={getattr(config, name)} prereg={value}"


def test_prereg_pins_the_target_commit():
    text = (config.ROOT / "PREREGISTRATION.md").read_text(encoding="utf-8")
    assert re.search(r"1e39ad3a2d9eca57efd9019fd089b5a04676da95", text)
