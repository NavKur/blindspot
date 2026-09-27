"""Step 14: prompt and answer parsing."""
from blindspot import examinee

QS = [
    {"id": "q1", "type": "tf", "text": "Is it true?"},
    {"id": "q2", "type": "value", "text": "What is the default?"},
    {"id": "q3", "type": "tf", "text": "Another?"},
]


def test_prompt_lists_every_question_and_mode_is_closed_book():
    prompt = examinee.build_prompt(QS)
    for q in QS:
        assert f"[{q['id']}]" in prompt
    assert "(value)" in prompt and "(yes/no)" in prompt
    assert "--disable-tool-groups" in examinee.EXAM_FLAGS and examinee.MODE_SLUG in examinee.EXAM_FLAGS
    assert "groups: []" in examinee.MODES_YAML


def test_parse_good_reply_with_fences_and_chatter():
    reply = 'Sure!\n```json\n[{"id":"q1","answer":true,"p":0.9},{"id":"q2","answer":"None","p":0.6},' \
            '{"id":"q3","answer":"false","p":1}]\n```'
    got = examinee.parse_answers(reply, QS)
    assert got["q1"] == {"answer": True, "p": 0.9}
    assert got["q2"] == {"answer": "None", "p": 0.6}
    assert got["q3"]["answer"] is False


def test_bad_items_are_dropped_not_guessed():
    reply = '[{"id":"q1","answer":"maybe","p":0.9},{"id":"q2","answer":null,"p":1.5},' \
            '{"id":"zz","answer":true,"p":0.5},{"id":"q3","answer":true,"p":true}]'
    assert examinee.parse_answers(reply, QS) == {}


def test_value_answers_given_as_json_values_become_literals():
    reply = '[{"id":"q2","answer":null,"p":0.5}]'
    assert examinee.parse_answers(reply, QS)["q2"]["answer"] == "None"
    reply = '[{"id":"q2","answer":0,"p":0.5}]'
    assert examinee.parse_answers(reply, QS)["q2"]["answer"] == "0"


def test_no_array_gives_nothing():
    assert examinee.parse_answers("I cannot help with that.", QS) == {}
