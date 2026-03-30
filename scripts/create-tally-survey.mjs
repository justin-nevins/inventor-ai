import { randomUUID } from 'crypto';

const API_KEY = process.env.TALLY_API_KEY;
if (!API_KEY) { console.error('Set TALLY_API_KEY'); process.exit(1); }
const uuid = () => randomUUID();

// Form title (must be first block)
function formTitle(text) {
  const id = uuid();
  return { uuid: id, type: 'FORM_TITLE', groupUuid: id, groupType: 'FORM_TITLE', payload: { html: `<h2>${text}</h2>` } };
}

// Rich text content (descriptions, instructions) — stays as <p>
function text(html) {
  const id = uuid();
  return { uuid: id, type: 'TEXT', groupUuid: id, groupType: 'TEXT', payload: { html } };
}

// Section heading — renders as h2, use <p> in payload (Tally strips <h2> tags)
function sectionHeading(label) {
  const id = uuid();
  return { uuid: id, type: 'HEADING_2', groupUuid: id, groupType: 'HEADING_2', payload: { html: `<p>${label}</p>` } };
}

// Question label — renders as h3 (bold), use <p> in payload
function questionLabel(label) {
  const id = uuid();
  return { uuid: id, type: 'HEADING_3', groupUuid: id, groupType: 'HEADING_3', payload: { html: `<p>${label}</p>` } };
}

function pageBreak() {
  const id = uuid();
  return { uuid: id, type: 'PAGE_BREAK', groupUuid: id, groupType: 'PAGE_BREAK', payload: {} };
}

function mc(questionText, options, required = false) {
  const gid = uuid();
  return [
    questionLabel(questionText),
    { uuid: uuid(), type: 'MULTIPLE_CHOICE', groupUuid: gid, groupType: 'MULTIPLE_CHOICE', payload: { isRequired: required } },
    ...options.map((t, i) => ({
      uuid: uuid(), type: 'MULTIPLE_CHOICE_OPTION', groupUuid: gid, groupType: 'MULTIPLE_CHOICE',
      payload: { index: i, isFirst: i === 0, isLast: i === options.length - 1, text: t },
    })),
  ];
}

function cb(questionText, options, required = false) {
  const gid = uuid();
  return [
    questionLabel(questionText),
    { uuid: uuid(), type: 'CHECKBOXES', groupUuid: gid, groupType: 'CHECKBOXES', payload: { isRequired: required } },
    ...options.map((t, i) => ({
      uuid: uuid(), type: 'CHECKBOX', groupUuid: gid, groupType: 'CHECKBOXES',
      payload: { index: i, isFirst: i === 0, isLast: i === options.length - 1, text: t },
    })),
  ];
}

function longText(questionText, placeholder = '', required = false) {
  const gid = uuid();
  return [
    questionLabel(questionText),
    { uuid: uuid(), type: 'TEXTAREA', groupUuid: gid, groupType: 'TEXTAREA', payload: { isRequired: required, placeholder } },
  ];
}

function shortText(questionText, placeholder = '', required = false) {
  const gid = uuid();
  return [
    questionLabel(questionText),
    { uuid: uuid(), type: 'INPUT_TEXT', groupUuid: gid, groupType: 'INPUT_TEXT', payload: { isRequired: required, placeholder } },
  ];
}

function email(questionText, required = true) {
  const gid = uuid();
  return [
    questionLabel(questionText),
    { uuid: uuid(), type: 'INPUT_EMAIL', groupUuid: gid, groupType: 'INPUT_EMAIL', payload: { isRequired: required, placeholder: 'your@email.com' } },
  ];
}

function scale(questionText, leftLabel, rightLabel, start = 1, end = 5) {
  const gid = uuid();
  return [
    questionLabel(questionText),
    { uuid: uuid(), type: 'LINEAR_SCALE', groupUuid: gid, groupType: 'LINEAR_SCALE',
      payload: { isRequired: false, start, end, step: 1, hasLeftLabel: true, leftLabel, hasRightLabel: true, rightLabel } },
  ];
}

// ── Build form ──
const blocks = [
  formTitle('Help Shape the Future of Inventing Tools'),
  text("<p>We're building a tool to help inventors like you move from idea to licensing deal — faster and with more confidence. This 5-minute survey helps us understand what you actually need. As a thank you, you'll get FREE ACCESS TO INVENTORAI FOR ONE MONTH — including AI-powered patent search and market validation tools.</p>"),

  // Section 1
  sectionHeading('Your Background'),
  ...mc('How would you describe your inventing experience level?', [
    'Beginner (0-1 ideas pursued)', 'Intermediate (2-5 ideas pursued)',
    'Experienced (6+ ideas pursued)', "I've successfully licensed a product",
  ]),
  ...mc('What best describes your current situation?', [
    "I have an idea but haven't started pursuing it",
    "I'm actively working on developing/protecting an idea",
    "I'm trying to find companies to license my idea",
    "I've had conversations with companies but no deal yet",
    "I've successfully licensed a product before",
  ]),
  ...mc('How long have you been working on your current/most recent idea?', [
    'Less than 3 months', '3-6 months', '6-12 months', '1-2 years', 'More than 2 years',
  ]),

  pageBreak(),

  // Section 2
  sectionHeading('Your Challenges'),
  ...longText('What is the SINGLE BIGGEST challenge you face as an inventor?', 'Tell us about your biggest frustration or obstacle...'),
  text('<p>Rate how challenging each stage of the licensing process is for you:</p>'),
  ...scale('Coming up with viable ideas', 'Not challenging', 'Extremely challenging'),
  ...scale('Validating if my idea has market potential', 'Not challenging', 'Extremely challenging'),
  ...scale('Understanding patent/IP protection options', 'Not challenging', 'Extremely challenging'),
  ...scale('Creating a professional sell sheet', 'Not challenging', 'Extremely challenging'),
  ...scale('Building a prototype', 'Not challenging', 'Extremely challenging'),
  ...scale('Finding companies that might license my idea', 'Not challenging', 'Extremely challenging'),
  ...scale('Getting responses from companies', 'Not challenging', 'Extremely challenging'),
  ...scale('Knowing what to say when pitching', 'Not challenging', 'Extremely challenging'),
  ...scale('Understanding licensing deal terms', 'Not challenging', 'Extremely challenging'),
  ...scale('Staying motivated through setbacks', 'Not challenging', 'Extremely challenging'),
  ...cb('What tasks take up the MOST of your time in the invention process? (Select up to 3)', [
    'Research (market, patents, companies)', 'Creating marketing materials (sell sheets, presentations)',
    'Prototyping or product development', 'Legal/IP work (patents, trademarks)',
    'Finding and contacting companies', 'Follow-up communications', 'Learning about the process itself',
  ]),
  ...cb('What have you ALREADY TRIED to help with your invention journey? (Select all that apply)', [
    'Books (One Simple Idea, etc.)', 'Online courses', 'YouTube videos',
    'Coaching/consulting services', 'Invention submission companies', 'Patent attorneys',
    'Trade shows', 'Inventor groups/communities', 'None of the above',
  ]),
  ...longText('What was your experience with those resources?', "What worked? What didn't? What was missing?"),

  pageBreak(),

  // Section 3
  sectionHeading('What Would Help You Most'),
  ...longText('If you could wave a magic wand and have ONE tool to help you succeed, what would it do?', 'Describe your dream tool or service...'),
  text('<p>How valuable would each of these services be to you?</p>'),
  ...scale('AI tool that evaluates if your idea has market potential', 'Not valuable', 'Extremely valuable'),
  ...scale('Automated patent/prior art search', 'Not valuable', 'Extremely valuable'),
  ...scale('AI-generated sell sheet creator', 'Not valuable', 'Extremely valuable'),
  ...scale('Database of companies that license products in your category', 'Not valuable', 'Extremely valuable'),
  ...scale('Scripts and templates for contacting companies', 'Not valuable', 'Extremely valuable'),
  ...scale('AI assistant to help write emails and follow-ups', 'Not valuable', 'Extremely valuable'),
  ...scale('Community of other inventors for support', 'Not valuable', 'Extremely valuable'),
  ...scale('Progress tracking and accountability system', 'Not valuable', 'Extremely valuable'),
  ...scale('Video courses teaching the licensing process', 'Not valuable', 'Extremely valuable'),
  ...scale('1-on-1 coaching with an experienced inventor', 'Not valuable', 'Extremely valuable'),
  text('<p>Think about the tool you just described - the one that would help you succeed as an inventor. Consider what that would be worth to you each month.</p>'),
  ...mc('At what monthly price would this service be so cheap you would question its quality?', [
    '$10/month', '$25/month', '$75/month', '$125/month', '$200/month',
  ]),
  ...mc('At what monthly price would this service feel like a great deal?', [
    '$10/month', '$25/month', '$75/month', '$125/month', '$200/month',
  ]),
  ...mc('At what monthly price would this service start to feel expensive, but you would still consider it?', [
    '$10/month', '$25/month', '$75/month', '$125/month', '$200/month',
  ]),
  ...mc('At what monthly price would this service be too expensive to consider, no matter what it included?', [
    '$10/month', '$25/month', '$75/month', '$125/month', '$200/month',
  ]),

  pageBreak(),

  // Section 4
  sectionHeading("Almost Done — Let's Stay in Touch"),
  ...mc('Would you be willing to participate in a 15-minute interview to share more about your experience?', ['Yes', 'No']),
  ...email('Email address (for free InventorAI access and potential interview)'),
  ...shortText('First name (optional)', 'Your first name'),
  ...longText("Anything else you'd like to share about your inventor journey?", "We'd love to hear anything else on your mind..."),

  // Thank you
  pageBreak(),
  sectionHeading('Thank You!'),
  text("<p>Thanks for sharing your experience! Your input is shaping the tools inventors actually need. You'll receive free access to InventorAI within the next couple of weeks. We'll send login details to the email you provided.</p>"),
];

async function createForm() {
  console.log(`Sending ${blocks.length} blocks...`);
  const res = await fetch('https://api.tally.so/forms', {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'PUBLISHED', blocks }),
  });
  const data = JSON.parse(await res.text());
  if (!res.ok) { console.error('Error:', JSON.stringify(data)); process.exit(1); }
  console.log('Form created!');
  console.log(`ID: ${data.id}`);
  console.log(`View: https://tally.so/r/${data.id}`);
  console.log(`Edit: https://tally.so/forms/${data.id}/edit`);
}
createForm();
