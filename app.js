const initialState = {
  characterName: "探索者A",
  hp: 12,
  san: 60,
  lastDice: null,
  target: null,
  judgement: "未判定",
  events: [],
  rolls: [],
  statusChanges: [],
};

const sampleTranscript = `KP: それではSANチェックです。目標値60で1d100をお願いします。
探索者A: 1d100振ります。結果は42です。
KP: 成功です。SAN減少なし。
探索者A: 聞き耳も振ります。出目78、目標値60。
KP: それは失敗ですね。
KP: 怪物を見たので追加でSANが3減少します。
探索者A: 現在SAN57です。
KP: 戦闘でHP-2です。`;

const elements = {
  characterName: document.querySelector("#characterName"),
  transcriptFile: document.querySelector("#transcriptFile"),
  transcriptInput: document.querySelector("#transcriptInput"),
  analyzeButton: document.querySelector("#analyzeButton"),
  resetButton: document.querySelector("#resetButton"),
  loadSampleButton: document.querySelector("#loadSampleButton"),
  fileStatus: document.querySelector("#fileStatus"),
  characterNameView: document.querySelector("#characterNameView"),
  hpView: document.querySelector("#hpView"),
  sanView: document.querySelector("#sanView"),
  lastDiceView: document.querySelector("#lastDiceView"),
  judgementView: document.querySelector("#judgementView"),
  eventLog: document.querySelector("#eventLog"),
  eventCount: document.querySelector("#eventCount"),
  jsonOutput: document.querySelector("#jsonOutput"),
};

let state = structuredClone(initialState);

function normalizeNumber(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function splitTranscript(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isVttTimestamp(line) {
  return /-->|^\d{1,2}:\d{2}(?::\d{2})?[.,]\d{3}/.test(line);
}

function stripVttCueSettings(line) {
  return line.replace(/\s+align:\S+|\s+line:\S+|\s+position:\S+|\s+size:\S+/g, "");
}

function normalizeVttSpeakerTags(line) {
  return line
    .replace(/^<v\s+([^>]+)>\s*(.+)$/i, "$1: $2")
    .replace(/<\/v>$/i, "")
    .replace(/<[^>]+>/g, "");
}

function normalizeTranscriptText(text) {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (/^WEBVTT/i.test(line)) return false;
      if (/^NOTE(?:\s|$)/i.test(line)) return false;
      if (/^\d+$/.test(line)) return false;
      if (isVttTimestamp(line)) return false;
      return true;
    })
    .map(stripVttCueSettings)
    .map(normalizeVttSpeakerTags)
    .join("\n");
}

function formatTranscriptItem(item) {
  if (typeof item === "string") {
    return item;
  }

  if (!item || typeof item !== "object") {
    return "";
  }

  const speaker = item.speaker || item.speaker_name || item.user_name || item.name || "";
  const text = item.text || item.transcript || item.content || item.message || "";

  if (!text) {
    return "";
  }

  return speaker ? `${speaker}: ${text}` : text;
}

function findTranscriptArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const keys = ["transcript", "transcripts", "segments", "items", "results", "records"];
  for (const key of keys) {
    if (Array.isArray(value[key])) {
      return value[key];
    }
  }

  return null;
}

function parseJsonTranscript(text) {
  const parsed = JSON.parse(text);
  const transcript = findTranscriptArray(parsed);

  if (transcript) {
    return transcript.map(formatTranscriptItem).filter(Boolean).join("\n");
  }

  return formatTranscriptItem(parsed) || JSON.stringify(parsed, null, 2);
}

function parseTranscriptFile(text, fileName) {
  const extension = fileName.split(".").pop()?.toLowerCase();

  if (extension === "json") {
    return parseJsonTranscript(text);
  }

  return normalizeTranscriptText(text);
}

function addEvent(type, message, extra = {}) {
  state.events.push({
    index: state.events.length + 1,
    type,
    message,
    ...extra,
  });
}

function extractSpeaker(line) {
  const match = line.match(/^([^:：]{1,24})[:：]\s*(.+)$/);
  if (!match) {
    return { speaker: null, text: line };
  }

  return {
    speaker: match[1].trim(),
    text: match[2].trim(),
  };
}

function findDiceRoll(text) {
  const explicitDice = text.match(/1d100/i);
  const explicitResult = text.match(/(?:結果は?|出目)\s*(\d{1,3})/);
  const spokenResult = text.match(/(?:^|[^\dA-Za-z-])(\d{1,3})(?:です|でした)/);
  const result = explicitResult || spokenResult;
  const value = result ? normalizeNumber(result[1]) : null;

  if (explicitDice || value !== null) {
    if (value !== null && value >= 1 && value <= 100) {
      return {
        notation: explicitDice ? "1d100" : null,
        value,
      };
    }
  }

  return explicitDice ? { notation: "1d100", value: null } : null;
}

function findTarget(text) {
  if (/現在\s*SAN/i.test(text)) {
    return null;
  }

  const targetMatch = text.match(/(?:目標値|目標|SAN)\s*(\d{1,3})/i);
  if (!targetMatch) {
    return null;
  }

  const value = normalizeNumber(targetMatch[1]);
  return value !== null ? value : null;
}

function findJudgement(text, roll, target) {
  if (/失敗/.test(text)) {
    return "失敗";
  }

  if (/成功/.test(text)) {
    return "成功";
  }

  if (roll && roll.value !== null && target !== null) {
    return roll.value <= target ? "成功" : "失敗";
  }

  return null;
}

function findStatusChanges(text) {
  const changes = [];
  const sanSet = text.match(/(?:現在)?SAN\s*(\d{1,3})/i);

  if (/SAN減少なし/i.test(text)) {
    changes.push({
      status: "SAN",
      operation: "delta",
      amount: 0,
      reason: "SAN減少なし",
    });
  }

  const sanMinus = text.match(/SAN\s*-\s*(\d{1,3})/i);
  if (sanMinus) {
    changes.push({
      status: "SAN",
      operation: "delta",
      amount: -normalizeNumber(sanMinus[1]),
      reason: `SAN-${sanMinus[1]}`,
    });
  }

  const sanDecrease = text.match(/SAN(?:が|を)?\s*(\d{1,3})\s*減少/i);
  if (sanDecrease) {
    changes.push({
      status: "SAN",
      operation: "delta",
      amount: -normalizeNumber(sanDecrease[1]),
      reason: `SANが${sanDecrease[1]}減少`,
    });
  }

  if (sanSet && !/SAN\s*-|減少/i.test(text)) {
    changes.push({
      status: "SAN",
      operation: "set",
      amount: normalizeNumber(sanSet[1]),
      reason: `SAN${sanSet[1]}`,
    });
  }

  const hpMinus = text.match(/HP\s*-\s*(\d{1,3})/i);
  if (hpMinus) {
    changes.push({
      status: "HP",
      operation: "delta",
      amount: -normalizeNumber(hpMinus[1]),
      reason: `HP-${hpMinus[1]}`,
    });
  }

  const hpDecrease = text.match(/HP(?:が|を)?\s*(\d{1,3})\s*減少/i);
  if (hpDecrease) {
    changes.push({
      status: "HP",
      operation: "delta",
      amount: -normalizeNumber(hpDecrease[1]),
      reason: `HPが${hpDecrease[1]}減少`,
    });
  }

  return changes;
}

function applyStatusChange(change) {
  const key = change.status.toLowerCase();
  const before = state[key];

  if (change.operation === "set") {
    state[key] = change.amount;
  } else {
    state[key] = Math.max(0, before + change.amount);
  }

  const after = state[key];
  state.statusChanges.push({ ...change, before, after });
  addEvent(
    "status",
    `${change.status}: ${before} -> ${after} (${change.reason})`,
    { status: change.status, before, after }
  );
}

function analyzeTranscript(text, characterName) {
  state = {
    ...structuredClone(initialState),
    characterName: characterName || initialState.characterName,
  };

  for (const rawLine of splitTranscript(text)) {
    const { speaker, text: line } = extractSpeaker(rawLine);
    const target = findTarget(line);

    if (target !== null) {
      state.target = target;
      addEvent("target", `目標値を${target}として検出`, { speaker, target });
    }

    const roll = findDiceRoll(line);
    if (roll) {
      if (roll.value === null) {
        addEvent("dice", `${roll.notation} のロール要求を検出`, {
          speaker,
          notation: roll.notation,
          source: rawLine,
        });
        continue;
      }

      const judgement = findJudgement(line, roll, state.target);
      state.lastDice = roll.value;

      if (judgement) {
        state.judgement = judgement;
      }

      const rollEvent = {
        speaker,
        notation: roll.notation || "1d100",
        value: roll.value,
        target: state.target,
        judgement: judgement || state.judgement,
        source: rawLine,
      };
      state.rolls.push(rollEvent);
      addEvent(
        "roll",
        `${rollEvent.notation}: ${roll.value ?? "結果待ち"} / 目標値 ${
          state.target ?? "-"
        } / ${rollEvent.judgement}`,
        rollEvent
      );
    } else {
      const judgement = findJudgement(line, null, state.target);
      if (judgement) {
        state.judgement = judgement;
        addEvent("judgement", `判定結果: ${judgement}`, { speaker, judgement });
      }
    }

    for (const change of findStatusChanges(line)) {
      applyStatusChange(change);
    }
  }

  if (state.events.length === 0) {
    addEvent("info", "抽出対象のイベントは見つかりませんでした");
  }

  return state;
}

function render() {
  elements.characterNameView.textContent = state.characterName;
  elements.hpView.textContent = state.hp;
  elements.sanView.textContent = state.san;
  elements.lastDiceView.textContent = state.lastDice ?? "-";
  elements.judgementView.textContent = state.judgement;
  elements.judgementView.className =
    state.judgement === "成功" ? "success" : state.judgement === "失敗" ? "failure" : "";

  elements.eventLog.innerHTML = "";
  for (const event of state.events) {
    const item = document.createElement("li");
    const type = document.createElement("span");
    const message = document.createElement("span");

    type.className = `event-type ${event.type === "status" ? "warning" : ""}`;
    message.className = "event-message";
    type.textContent = event.type;
    message.textContent = event.message;
    item.append(type, message);
    elements.eventLog.append(item);
  }

  elements.eventCount.textContent = String(state.events.length);
  elements.jsonOutput.textContent = JSON.stringify(state, null, 2);
}

function reset() {
  state = structuredClone(initialState);
  elements.characterName.value = initialState.characterName;
  elements.transcriptInput.value = "";
  elements.transcriptFile.value = "";
  elements.fileStatus.textContent = "未選択";
  render();
}

elements.analyzeButton.addEventListener("click", () => {
  analyzeTranscript(elements.transcriptInput.value, elements.characterName.value.trim());
  render();
});

elements.resetButton.addEventListener("click", reset);

elements.loadSampleButton.addEventListener("click", () => {
  elements.transcriptFile.value = "";
  elements.fileStatus.textContent = "サンプルを読み込みました";
  elements.transcriptInput.value = sampleTranscript;
  analyzeTranscript(elements.transcriptInput.value, elements.characterName.value.trim());
  render();
});

elements.transcriptFile.addEventListener("change", async () => {
  const file = elements.transcriptFile.files[0];
  if (!file) {
    elements.fileStatus.textContent = "未選択";
    return;
  }

  try {
    const rawText = await file.text();
    const parsedText = parseTranscriptFile(rawText, file.name);
    elements.transcriptInput.value = parsedText;
    elements.fileStatus.textContent = `${file.name} を取り込みました`;
    analyzeTranscript(parsedText, elements.characterName.value.trim());
    render();
  } catch (error) {
    elements.fileStatus.textContent = "取り込みに失敗しました";
    console.error(error);
  }
});

elements.characterName.addEventListener("input", () => {
  state.characterName = elements.characterName.value.trim() || initialState.characterName;
  render();
});

elements.transcriptInput.value = sampleTranscript;
analyzeTranscript(sampleTranscript, elements.characterName.value);
render();
