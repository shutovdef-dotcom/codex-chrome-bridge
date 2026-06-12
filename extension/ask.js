const params = new URLSearchParams(location.search);
const requestId = params.get('id');

function requiredElement(selector) {
  const element = document.querySelector(selector);
  if (element) return element;
  document.body.textContent = `Codex Bridge Prompt is missing required element: ${selector}`;
  throw new Error(`Missing required prompt element: ${selector}`);
}

const question = requiredElement('#question');
const choices = requiredElement('#choices');
const answer = requiredElement('#answer');
const submit = requiredElement('#submit');
const cancel = requiredElement('#cancel');

let selectedChoice = null;

function sendAnswer(payload) {
  chrome.runtime.sendMessage({
    type: 'codex-bridge-user-answer',
    requestId,
    ...payload,
  });
}

function renderPrompt(prompt) {
  document.title = 'Codex Bridge Prompt';
  question.textContent = prompt.question;
  answer.hidden = !prompt.allowText;
  submit.hidden = !prompt.allowText;

  choices.replaceChildren();
  for (const choice of prompt.choices || []) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = choice.label;
    button.addEventListener('click', () => {
      selectedChoice = choice;
      sendAnswer({
        value: choice.value,
        text: choice.label,
        choice,
      });
    });
    choices.append(button);
  }

  if (prompt.allowText) {
    answer.focus();
  } else if (choices.firstElementChild) {
    choices.firstElementChild.focus();
  } else {
    cancel.focus();
  }
}

async function loadPrompt() {
  if (!requestId) {
    question.textContent = 'Missing prompt id.';
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: 'codex-bridge-get-user-prompt',
    requestId,
  });

  if (!response?.ok || !response.prompt) {
    question.textContent = 'This prompt is no longer available.';
    return;
  }

  renderPrompt(response.prompt);
}

submit.addEventListener('click', () => {
  sendAnswer({
    value: answer.value,
    text: answer.value,
    choice: selectedChoice,
  });
});

answer.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    submit.click();
  }
});

cancel.addEventListener('click', () => {
  sendAnswer({
    canceled: true,
    reason: 'user canceled',
  });
});

loadPrompt().catch((error) => {
  question.textContent = String(error?.message || error);
});
