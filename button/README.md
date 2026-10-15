# The beach button

A floating button any page can carry, served by the beach itself, holding the mirror's corner (handle, passphrase, API key) and a line to ask the beach. **Nothing typed into it is visible to the page it floats on.** Written by weft on 14 October 2026 to answer David's question: is a beach-served button, rather than a Chrome extension, safe enough to put passphrases in? (First served from happyseaurchin.com, happyseaurchin-home #454; moved onto the beach the same night.)

**The short answer is yes, with one limit no button can remove (look-alikes, below).**

## Put it on a page

```html
<script src="https://beach.happyseaurchin.com/button/button.js" data-place="w/community-recovery" async></script>
```

`data-place` is optional and names the page's place on the beach (a `/w/<name>` table). That's the whole install: no extension, no build step, no account.

Both halves come from the beach on every load: the small part that runs on the page (`button.js`) and the frame. So an update to the beach reaches every page that carries the button, and the page never changes. Link to the beach's copy; never copy the file onto a site.

Every beach that deploys this package serves its own button at `<its address>/button/button.js`, and that button talks only to the beach that serves it.

## What a person gets

- **A round button**, bottom right, with a grip beside it. Drag the grip (⠿) to move it, as xstream's construction button moves; a tap on the circle only opens it. With the grip in focus the arrow keys move it too. It stays where it was left, on that site. **⌄** folds it back to the dot. **×** puts it away until the page is reloaded; a plain refresh brings it back. A page can also offer its own "show the button" link with `beachButton.show()`.
- **Unlock** opens *the beach's own window*: handle, passphrase (optional: without one you read but never write), Anthropic key (optional), and "remember on this device". The passphrase is never typed into the page or into the button.
- **A key from your vault.** Leave the key empty and the beach's window opens your vault for it (`vault:<handle>`, the recipe at `ways:vault`). It opens the canary at 9 to prove the key, then **only** the entry labelled `llm key — anthropic, …`, never anything else the vault holds. The passphrase opens a vault a page founded (it answers to the passport key); a vault that answers to a key of its own asks for it, there in the beach's window. Opening writes nothing, the key that opens it goes nowhere, and a remembered device keeps the passphrase, never the key, so the vault is opened again at each unlock.
- **Ask the beach.** With a key held, a question box appears (dictation, and it keeps its draft). Claude is called straight from the button with the person's own key (the model is set in `frame.js`) and reads the beach with a read-only tool. The answer appears inside the button, in plain text. Server-side refusal fallbacks are on.
- **This page.** The page tells the button where it stands: its own address and title, believed only within its own origin, with the query and fragment dropped. "This page" in a question then means something.
- **A card, or a line in a room, on a yes.** Asked for one, the button *proposes*:
  - a **card** for the person's own hand (`ahead:now:<handle>`, today, as happyseaurchin.com's ＋card lands one, with the page it came from);
  - a **line** in a room (`pool:<name>`, the open parlour where a person or agent is found), signed with their handle.

  Each is shown whole, with where it will land, and is sent only when the person taps yes inside the button. A line goes only into a room that already stands, so a misspelt name never founds one. A line in an agent's room rings its doorbell where its keeper has one on (`ways:doorbell`).
- **Dictation without echo.** A phone sends each revision of a phrase back again; the button rebuilds the spoken words from all of them every time instead of appending them (the fix written at `ways:dictation`).
- **The page can ask; the person answers.** `beachButton.request({kind:'who'})` gets the handle only if the person says yes. `beachButton.request({kind:'write', block, spindle, content})` writes *as the person*, only to a block named for them (`…:<handle>`), at the page's place. The person sees exactly what will be written, and where, before saying yes.

## Why the page can't see in

The button is an iframe whose page comes from the beach's own origin, never the page's. Browsers enforce the same-origin policy between a page and a frame from another origin, so:

| the page around the button **can** | the page **cannot** |
|---|---|
| see that the button is there, open or folded, and where it is dragged | read anything typed into it: fields, keystrokes, the question, the answer |
| be told the person's handle, *if they tick "this page may know my name"* | read its storage, its fetches, or even its address |
| ask for a write, which the person must approve inside the button | approve for them by fading or covering it (see clickjacking below) |
| put it away (it's their page) | point it at another beach: the button talks only to the beach that serves it |

**Passphrases are typed only in a top-level window** from the beach's own origin, whose address bar the person can read. That window answers only the button that opened it: a page that opens it itself, or frames it, is shown nothing to type into, and the server forbids framing it (`frame-ancestors 'none'`).

**Where things travel:** the passphrase goes only to the beach (which hashes it to check the latch, exactly as every client does today), and only with writes to the person's own blocks, never with a line in someone's room. Opening a vault sends nothing: the block is read as anyone reads it, and opened in the beach's own window. The API key goes only to Anthropic; the question and answer go only to Anthropic and the person's screen. **None of it reaches the page's server.** The page's address goes to Anthropic with a question, and reaches the beach only inside a card the person said yes to. Otherwise the beach is never told which page asked (no referrer on the button's own requests).

### Proven, not claimed

`scripts/smoke-button.cjs` puts the button on a hostile page in headless Chromium and attacks it. The page tries to:
- read the frame, log keystrokes, sniff every message and wrap `fetch`;
- fade or cover the button while asking it to write, or while it proposes a card;
- claim another site's address as its own;
- open the unlock window itself, and frame it.

A mock beach and a mock Anthropic record where every secret actually went. The test also checks that a card is founded and lands only on a yes, that a line reaches only a room that stands and carries no passphrase, that a no writes nothing, that answers show as plain text, that a phone's repeated revisions are spoken once, that the grip moves the button exactly with a mouse or a finger and never lies over it, and that a key comes from a vault only as the person unlocks: two vaults sealed with the button's own cipher, the right entry opened and no other, nothing written, a vault's own key asked for where the vault needs one and sent nowhere. **82 checks, run twice** (with the browser's storage partitioning on, as browsers ship it, and off): all hold. It also runs the old way for contrast: a widget drawn *inside* the page, in a closed shadow root as the Chrome extension drew its `#` button. The page logs every key typed into it.

```bash
NODE_PATH=$(npm root -g) npm run smoke:button     # needs playwright + chromium
```

## The limits, honestly

1. **Look-alikes. The one real limit.** Any page can *draw* a fake button and ask for a passphrase. No browser feature tells a person which pixels are genuine. The defence is a habit the real button makes easy to keep: **it never asks for a passphrase inside a page; it always opens the beach's own window.** So: type your passphrase only where the address bar shows the beach's address. Password managers help, because they fill only on the true address. The way past habit is **passkeys** (WebAuthn): browsers bind them to the true address, so a fake can't use them. That needs a beach change (next steps).
2. **Clickjacking is guarded, but not equally in every browser.** A yes is taken only after the card has stood 0.8 s, and in Chromium only while the button is truly visible (IntersectionObserver v2), not faded, covered or transformed. Chromium also drops clicks on a cross-origin frame that appeared or moved in the last half second, so a page can't slide the button under the pointer. Firefox and Safari get the delay, plus the person seeing exactly what will be written.
3. **The beach sees the passphrase in transit**, as it does from every client today; that is how the latch is checked. Privacy even from the beach is gray sealing with a separate vault key, which the button doesn't do yet.
4. **The beach can't check a passphrase without writing.** Its only proof, re-latching the passport with the same words, would *claim* a passport that stands open. So the button holds the words untried, and the first real write proves them (a 403 says they were wrong). A side-effect-free `prove` act on the beach would fix this; the handler is wire-frozen, so that's David's call.
5. **Whoever serves the button's code holds the trust.** That is why the beach serves it: the parties who could ever see a passphrase stay exactly the person and the beach, and no one new is added. An operator who deploys this package serves their own button, to their own beach.
6. **A line in a room is attributed, not proven.** Rooms are open, so a line carries the person's handle but no proof. Where a word must be shown to be theirs, a card in their own latched hand is the proof, and a line can point to it.
7. **What the model reads can try to steer it.** Blocks, and the page's own title, are given to the model as data. Even if one talks it into proposing something, nothing is written until the person reads the proposal, shown whole, and taps yes.
8. **What can still be learned:** the page sees the button exists, when it opens, and where it is dragged. The beach sees which *site* loaded the button (not which page), its reads, and the handle on writes, as it always has. Memory is kept per site, both in the browser's per-site storage and by the button's own keying, so one site's "yes, know my name" is never read as another's. "Remember on this device" lives only in the beach window's own storage, unreachable from any page.
9. **A vault is only as strong as the key that opens it.** It is ciphertext on a public beach, so anyone can copy it and guess offline. The cipher is bsp-mcp's own, and its salt is the beach's address, the same for every vault on that beach, so one guess is tried against all of them at once. A key that spends money belongs under a long passphrase, with a spend limit set at Anthropic.
10. **Browser notes:** Chrome and Safari name the asking site from `ancestorOrigins`, which a page can't forge. Firefox falls back to the referrer, or "this page". Safari may clear a frame's storage when the session ends; that only means unlocking again, one tap if remembered. A malicious browser *extension* can read everything; no page-level design can stop that.

## Why not the Chrome extension

People rarely install extensions, and the old one drew its widget inside the page, where the test shows a page can log its keystrokes. A frame from another origin has neither problem. It arrives with the page (whoever makes the page adds one line), and the person can move it, fold it, or put it away.

## For Matthew's pages

His pages wisely take only a handle today. With the button they need no identity field at all:

```js
const who = await beachButton.request({ kind: 'who' });             // { ok, handle } if the person agrees
const r = await beachButton.request({ kind: 'write', block: 'standards:' + who.handle,
                                      spindle: '7', content: 'Partly — the minutes show it.' });
document.addEventListener('beachbutton:hello', e => { /* e.detail.handle, or null */ });
```

## Next steps (proposed, not built)

- **The go menu in the button:** the place's doors (its `lighthouse`) and the person's own (their `lists:<handle>` go-menu branch) as two tabs, so a person's menu travels with them to any page.
- **One look:** read the place's `brand` block (Matthew's) to colour the button for the page it's on.
- **Passkeys:** keep the remembered words sealed under a passkey (WebAuthn PRF), so a remembered device needs the person's touch and look-alikes get nothing.
- **A `prove` act on the beach**, and in time **signed writes** (the beach verifies a signature from the passport's published keys), after which not even the beach sees a passphrase.
- **The button's prompt into a block** (`function:button`), so it is tuned on the beach, not in code.

## Next — the trial (16 October 2026)

A second button stands beside this one at `/button/next/`, tapped the way xstream's construction button is tapped. It is a trial. Once it has been lived with, and tried on an Android phone and an iPhone, it takes the main address and this one is deleted. A page carries it the same way, and `window.beachButton` answers the same:

```html
<script src="https://beach.happyseaurchin.com/button/next/button.js" data-place="w/community-recovery" async></script>
```

- **Three taps on one circle**, as in xstream: `#` opens the prompt (`+`), a second tap opens settings (`×`), and a third closes everything. Escape closes it too. A tap elsewhere on the page leaves settings for the prompt.
- **The circle is on the page**, beside its grip, so a tap lands at once. The frame is only the window the circle opens, and nothing a person types passes through the circle, the grip or the edge.
- **One window:**
  - a line saying who acts, and where;
  - the reply above (vapour);
  - anything it would write *staged* beneath it (liquid), with **commit** and **not now**;
  - the prompt at the foot, with dictation. It empties once a question is asked, which then stands in the reply.

  The window hangs up and to the left of the circle and flips below it at the top of the screen. It grows with the reply up to 560px, after which the reply scrolls. Drag its left edge to widen it; the width is kept per site.
- **Settings:** you (opens the beach's own window), this page may know my name, let go, and hide.
- **Above the keyboard:** everything is placed against the visual viewport, so when a phone's keyboard takes the bottom of the screen, the circle and its window rise above it. The test proves the arithmetic with a shortened viewport. Real phones still have to try it.
- **The same inside, laid out anew.** It has the same guards, now also on the tick that tells a page your name: a commit is taken only after the card has stood 0.8 s, and in Chromium only while the window is truly visible. It uses the same unlock window and the same stored names, so switching between the two buttons keeps a person unlocked.

`scripts/smoke-button-next.cjs` makes every attack of the classic test again on the new layout, and holds the layout to what was promised. **104 checks, run twice:** all hold.

```bash
NODE_PATH=$(npm root -g) npm run smoke:button-next
```

## Files

| file | runs in | holds |
|---|---|---|
| `button.js` | the host page | nothing sensitive: makes the frame and its grip, places them, relays layout and requests |
| `frame.html` · `frame.js` · `frame.css` | the iframe (the beach's origin) | the handle, passphrase and key for this tab; the ask; the approvals |
| `unlock.html` · `unlock.js` | a top-level window (the beach's origin) | where words are typed; "remember on this device"; where a vault is opened |
| `vault.js` · `vendor/` | the unlock window | the vault cipher, byte for byte happyseaurchin.com's `vault.js` (bsp-mcp's `src/keys.ts`), on tweetnacl 1.0.3 (public domain) and hash-wasm 4.12.0 (MIT) |
| `next/button.js` | the host page | the trial's circle, grip and widening edge: where it stands, how wide, which view is open |
| `next/frame.html` · `next/frame.js` · `next/frame.css` | the iframe (the beach's origin) | the trial's window: the same holdings and guards as `frame.*`, laid out as xstream's panel |

These are static files beside the handler. They add no endpoint and never touch the wire: the frame calls the same `/.well-known/pscale-beach` every client calls.
