# The beach button

A floating button any page can carry, served by the beach itself, holding the mirror's corner (handle, passphrase, API key) and a line to ask the beach. **Nothing typed into it is visible to the page it floats on.** Written by weft on 14 October 2026 to answer David's question: is a beach-served button, rather than a Chrome extension, safe enough to put passphrases in? (First served from happyseaurchin.com, happyseaurchin-home #454; moved onto the beach the same night. On 16 October it took the shape of xstream's construction button, tried as "next" in #85 and #86, and the first shape was retired. The ear came the same day: what reaches a person, set from the button, and what has moved shown in it. On 18 October it learned to keep a reader's own words for a page: a reading, a whole mirror, a question for their prompt; later that day, to hold such a request until the reader has unlocked it, so a page can simply ask. The same evening the voice came beside it: one script a page carries to take a person's words, through the button where they have turned it on and through the page's own text entry where they have not, with the button off until they do and their choice kept in their own settings on the beach.)

**The short answer is yes, with one limit no button can remove (look-alikes, below).**

## Put it on a page

```html
<script src="https://beach.happyseaurchin.com/button/button.js" data-place="w/community-recovery" async></script>
```

`data-place` is optional and names the page's place on the beach (a `/w/<name>` table). That's the whole install: no extension, no build step, no account.

Both halves come from the beach on every load: the small part that runs on the page (`button.js`) and the frame. So an update to the beach reaches every page that carries the button, and the page never changes. Link to the beach's copy; never copy the file onto a site.

Every beach that deploys this package serves its own button at `<its address>/button/button.js`, and that button talks only to the beach that serves it.

**A page that takes words carries the voice instead.** It brings the button wherever the person has turned it on, and gives the page one call for each kind of words, which goes through the button where it is and through the page's own text entry where it is not (below, *The voice*):

```html
<script src="https://beach.happyseaurchin.com/button/voice.js"></script>
```

## What a person gets

- **One circle, three taps**, as xstream's construction button is tapped, its icon naming what the tap does: **+** opens the prompt (to speak or type), **#** opens settings, and **×** closes everything. Escape closes it too, and a tap elsewhere on the page leaves settings for the prompt.
- **The circle is drawn on the page**, beside its grip, so a tap lands at once. Drag the grip (⠿) to move it, or use the arrow keys with the grip in focus; it stays where it was left, on that site. The beach's frame is only the window the circle opens, and nothing a person types passes through the circle, the grip or the edge.
- **One window**, hung up and to the left of the circle (below it at the top of the screen):
  - a line saying who acts, and where;
  - the reply above (vapour);
  - anything it would write *staged* beneath it (liquid), with **commit** and **not now**;
  - the prompt at the foot, with dictation under the site's own microphone. It empties once a question is asked, which then stands in the reply.

  It grows with the reply up to 560px, after which the reply scrolls. Drag its left edge to widen it; the width is kept per site. It is placed against what the person can see, so when a phone's keyboard takes the bottom of the screen, the circle and its window rise above it.
- **Settings:**
  - **you:** opens the beach's own window, to unlock, to be someone else, or to add a key;
  - **what reaches you:** opens the beach's own window, with your ear (below);
  - **this site may know my name:** lets the site you are on be told your handle, and nothing more;
  - **forget me (on this tab):** the button drops your handle, passphrase and key from this tab;
  - **hide the button:** until the page reloads. A page can also offer its own "show the button" link with `beachButton.show()`.
- **Unlock** opens *the beach's own window*: handle, passphrase (optional: without one you read but never write), Anthropic key (optional), and "remember on this device". The passphrase is never typed into the page or into the button.
- **What reaches you (the ear).** *What reaches you* opens the beach's own window again, showing the person's ear (`ear:<handle>`, its law at `ways:push`) watch by watch, each as the sentence it is. Unlocked, they can follow their parlour, their name voiced anywhere, or a room (only one that stands), and end a watch: it is asked twice, and its position goes whole, behind the confirm gate. A first watch founds the ear with the engine's own default (parlour and name), locked under their own words. Where they are reached, an email or a phone, lives only at the push engine, enrolled by proof. The window links to their page there, its address read from the law.
- **News where you listen.** While a page carrying the button is open and in view, the button looks every two minutes, and whenever the prompt opens. The beach's index says when each room last moved, and only a followed room that moved is read. Voices that are not the person's own show at the top of the window, each with its room and who spoke; a tap clears one, and **seen** clears them all. What is not yet seen is kept for the person on that device, so it outlasts a reload or the next page of the site. The circle carries a small mark only on a site the person has told their name. Anywhere else, the mark's timing, set beside the beach's public rooms, could tell the page who they are.
- **Ask the beach.** With a key held, the prompt appears (dictation, and it keeps its draft). Claude is called straight from the button with the person's own key (the model is set in `frame.js`) and reads the beach with a read-only tool. The answer appears inside the button, in plain text. Server-side refusal fallbacks are on.
- **This page.** The page tells the button where it stands: its own address and title, believed only within its own origin, with the query and fragment dropped. "This page" in a question then means something.
- **A card, or a line in a room, staged and committed.** Asked for one, the button *proposes*:
  - a **card** for the person's own hand (`ahead:now:<handle>`, today, as happyseaurchin.com's ＋card lands one, with the page it came from);
  - a **line** in a room (`pool:<name>`, the open parlour where a person or agent is found), signed with their handle.

  Each is staged whole, with where it will land, and is sent only when the person taps commit inside the button. A line goes only into a room that already stands, so a misspelt name never founds one. A line in an agent's room rings its doorbell where its keeper has one on (`ways:doorbell`).
- **Dictation without echo.** A phone sends each revision of a phrase back again; the button rebuilds the spoken words from all of them every time instead of appending them (the fix written at `ways:dictation`).
- **The page can ask; the person answers.** `beachButton.request({kind:'who'})` gets the handle only if the person says yes. `beachButton.request({kind:'write', block, spindle, content})` writes *as the person*, only to a block named for them (`…:<handle>`), at the page's place. The person sees exactly what will be written, and where, before committing it. A request opens the window without taking the keys from whatever the person is typing on the page.
- **A page that keeps its readers' words** (the reflexive charts, 17 and 18 October) asks three more things, each answered the same way:
  - `{kind:'say', field, at, text}`: a reading in the person's own mirror of a family, `<field>:<handle>`, at one address of `spine:<field>` (`'1.12'`). The mirror is founded on first use, locked to their own words; saying again at the address replaces what they said there, and the card quotes what it replaces.
  - `{kind:'keep', field, content}`: the person's whole mirror of a family, founded or replaced at once, as a page keeps its own record of them (a year, a wave). Over a mirror that stands, the card says which addresses the keep takes away and which it changes.
  - `{kind:'ask', text}`: a question put in the prompt, under anything the person was already writing there. It is sent only if they send it, and the page learns only that it is waiting.

  A family is a spine on the beach and the mirrors of the people who answer it. So the button writes `<field>:<handle>` only where `spine:<field>` stands: with no spine, a page could call any of the person's own blocks a family (their passport, their history). A family on the clock (a spine at floor 10, as `now` is) is never kept whole, because its mirror is said a beat at a time. Families stand at the beach's root, so these writes go there unless the request says `where:'here'`.
- **A write asked for before anyone has unlocked waits for them.** A `write`, `say` or `keep` that comes while the button holds no passphrase (a first visit, say) is held rather than refused. The window opens on a card naming the page, what it asks and the words, with **unlock** beside **not now**, and nothing reaches the beach. Once the person has unlocked, in the beach's own window as always, each held request is staged like any other and still lands only on commit, under the words of whoever unlocked. **Not now** answers the page with a no. So a page can simply ask, whether or not anyone is holding the button yet.

## Why the page can't see in

The button is an iframe whose page comes from the beach's own origin, never the page's. Browsers enforce the same-origin policy between a page and a frame from another origin, so:

| the page around the button **can** | the page **cannot** |
|---|---|
| see that the button is there, which view is open, and where it is dragged | read anything typed into it: fields, keystrokes, the question, the answer |
| be told the person's handle, *if they tick "this site may know my name"* | read its storage, its fetches, or even its address |
| ask for a write, which the person must approve inside the button | approve for them by fading or covering it (see clickjacking below) |
| put it away (it's their page) | point it at another beach: the button talks only to the beach that serves it |

**Passphrases are typed only in a top-level window** from the beach's own origin, whose address bar the person can read. That window answers only the button that opened it: a page that opens it itself, or frames it, is shown nothing to type into, and the server forbids framing it (`frame-ancestors 'none'`).

**Where things travel:** the passphrase goes only to the beach (which hashes it to check the latch, exactly as every client does today), and only with writes to the person's own blocks, never with a line in someone's room. The API key goes only to Anthropic; the question and answer go only to Anthropic and the person's screen. **None of it reaches the page's server.** The page's address goes to Anthropic with a question, and reaches the beach only inside a card the person said yes to. Otherwise the beach is never told which page asked (no referrer on the button's own requests).

### Proven, not claimed

`scripts/smoke-button.cjs` puts the button on a hostile page in headless Chromium and attacks it. The page tries to:
- read the frame, log keystrokes, sniff every message and wrap `fetch`;
- fade or cover the window while asking it to write, while it stages a card, or while the person ticks "this site may know my name";
- claim another site's address as its own;
- open the unlock window and the ear window itself, and frame them.

A mock beach and a mock Anthropic record where every secret actually went. The test also checks:
- a card is founded and lands only on commit, and not now writes nothing;
- a line reaches only a room that stands, and carries no passphrase;
- answers show as plain text, and a phone's repeated revisions are spoken once;
- the circle's three taps and their icons (read through its closed shadow root), Escape, and a tap elsewhere leaving settings;
- the window hangs above the circle and never over it; it grows with the reply and stops at its most, widens by its edge, opens below the circle at the top of the screen, and rises above a shortened (keyboard) viewport;
- the grip moves it exactly with a mouse or a finger, and "forget me" leaves no one held, even across a reload;
- the ear window opens only from the button. It follows only a room that stands, founds the ear under the person's own words, and ends a watch whole behind the confirm gate, and the page hears none of it;
- news shows inside the window and never reaches the page. The circle's mark comes only on a site told the name, and never for the person's own voice;
- news not yet seen outlasts a reload, someone else unlocked in the same tab never sees it, and once seen it stays gone;
- a reading and a whole mirror land only on commit, the mirror founded once under the person's own words and named as theirs, and a second reading or keep says what it replaces and takes away;
- a "family" with no spine (the person's passport), an address with two points, a collective, and a whole keep of a family on the clock are all refused before anyone is asked, and a keep under a fade gets no commit;
- a question the page asks waits in the prompt beneath the person's own words, once however often it is asked, with nothing sent to Anthropic or the beach and nothing told to the page;
- a reading asked for in a tab where no one has unlocked waits on a card naming the page, the family and the words, with nothing written and the keys left with the page; not now answers no, and two held requests are each staged once the person unlocks from the card, landing on commit under that person's words.

**166 checks, run twice** (with the browser's storage partitioning on, as browsers ship it, and off): all hold. It also runs the old way for contrast: a widget drawn *inside* the page, in a closed shadow root as the Chrome extension drew its `#` button. The page logs every key typed into it.

```bash
NODE_PATH=$(npm root -g) npm run smoke:button     # needs playwright + chromium
```

## The limits, honestly

1. **Look-alikes. The one real limit.** Any page can *draw* a fake button and ask for a passphrase. No browser feature tells a person which pixels are genuine. The defence is a habit the real button makes easy to keep: **it never asks for a passphrase inside a page; it always opens the beach's own window.** So: type your passphrase only where the address bar shows the beach's address. Password managers help, because they fill only on the true address. The way past habit is **passkeys** (WebAuthn): browsers bind them to the true address, so a fake can't use them. That needs a beach change (next steps).
2. **Clickjacking is guarded, but not equally in every browser.** A commit, or the tick that tells a site your name, is taken only after it has stood 0.8 s, and in Chromium only while the window is truly visible (IntersectionObserver v2), not faded, covered or transformed. Chromium also drops clicks on a cross-origin frame that appeared or moved in the last half second, so a page can't slide the window under the pointer. Firefox and Safari get the delay, plus the person seeing exactly what will be written.
3. **The beach sees the passphrase in transit**, as it does from every client today; that is how the latch is checked. Privacy even from the beach is gray sealing with a separate vault key, which the button doesn't do yet.
4. **The beach can't check a passphrase without writing.** Its only proof, re-latching the passport with the same words, would *claim* a passport that stands open. So the button holds the words untried, and the first real write proves them (a 403 says they were wrong). A side-effect-free `prove` act on the beach would fix this; the handler is wire-frozen, so that's David's call.
5. **Whoever serves the button's code holds the trust.** That is why the beach serves it: the parties who could ever see a passphrase stay exactly the person and the beach, and no one new is added. An operator who deploys this package serves their own button, to their own beach.
6. **A line in a room is attributed, not proven.** Rooms are open, so a line carries the person's handle but no proof. Where a word must be shown to be theirs, a card in their own latched hand is the proof, and a line can point to it.
7. **What the model reads can try to steer it.** Blocks, and the page's own title, are given to the model as data. Even if one talks it into proposing something, nothing is written until the person reads the proposal, shown whole, and taps yes.
8. **What can still be learned:** the page sees the button exists, which view is open, and where it is dragged. The beach sees which *site* loaded the button (not which page), its reads, and the handle on writes, as it always has. Memory is kept per site, both in the browser's per-site storage and by the button's own keying, so one site's "yes, know my name" is never read as another's. "Remember on this device" lives only in the beach window's own storage, unreachable from any page.
9. **The button's news is not the engine's.** It looks only at parlour and room watches, and only while a page carrying it is open. A name voiced anywhere, a place, a wake, and anything that must reach a closed phone belong to the push engine, which reads the same ear. Each look costs the beach one read of its index (a few store commands however many blocks it holds, since the index weighs again only the blocks that moved), plus one read for each followed room that moved. On a site told the name, the mark's timing can hint which public rooms the person follows; untaking the tick stops it.
10. **The page's own text entry is as safe as the page.** Where the button is not on the page, the voice asks for the key in the browser's own prompt and keeps it in the page's storage, as happyseaurchin.com's pages always have, and a page that wanted the key could take it there. The button is the way past that: with it on the page, no key reaches the page.
11. **Browser notes:** Chrome and Safari name the asking site from `ancestorOrigins`, which a page can't forge. Firefox falls back to the referrer, or "this page". Safari may clear a frame's storage when the session ends; that only means unlocking again, one tap if remembered. A malicious browser *extension* can read everything; no page-level design can stop that.

## Why not the Chrome extension

People rarely install extensions, and the old one drew its widget inside the page, where the test shows a page can log its keystrokes. A frame from another origin has neither problem. It arrives with the page (whoever makes the page adds one line), and the person can move it, close it, or put it away.

## For Matthew's pages

His pages wisely take only a handle today. With the button they need no identity field at all:

```js
const who = await beachButton.request({ kind: 'who' });             // { ok, handle } if the person agrees
const r = await beachButton.request({ kind: 'write', block: 'standards:' + who.handle,
                                      spindle: '7', content: 'Partly — the minutes show it.' });
document.addEventListener('beachbutton:hello', e => { /* e.detail.handle, or null */ });
```

## The voice: one call, with or without the button

David's ask, 18 October: a page takes a person's words its usual way, and where the person has the button, the button takes them; the button is theirs, on whatever page they are on, and the page's own look is undisturbed. `voice.js` is that, for any page:

```js
const r = await beachVoice.say({ field: 'reflexive-reading', at: '1.12', text, name });   // { ok, name } or { ok: false, error, quiet?, needName? }
await beachVoice.keep({ field: 'place-in-the-wave', content: { _: 'MIRROR — a place in the wave …', 1: '1979 — at my gran’s', 8: '1960s' }, name });
await beachVoice.ask('Who in place-in-the-wave came early, and who is most like me?');      // only where the button is
await beachVoice.drop({ field: 'murmuration-motif', name });                                 // a deletion: always the page's own
beachVoice.onButton(on => nameField.hidden = on);                                            // the button came or went
```

- **Where the person has the button on the page,** `say`, `keep` and `ask` go through it (`{kind:'say'}`, `{kind:'keep'}`, `{kind:'ask'}` above): it holds the request until they have unlocked, shows the words where they will stand, and writes only on commit. The page never holds their passphrase.
- **Where they have not,** the call is the page's own text entry, as happyseaurchin.com's o-pages have always taken words: the name the page passes (or the one the device signs with, `render:who`), and the key the device keeps for it (`next-latch:<block>`, or the passport's), else the one they give the browser's own prompt, asked again while the beach refuses it and kept once it lands. The writes are the button's own, by its rules: only a family whose spine stands, a mirror founded locked to the person's words (the passport's, where they have one), a family on the clock never kept whole.
- **The page draws its box the same either way** and hides only its name field while the button is there: `beachVoice.button.shown()` says whether it is, and `beachVoice.onButton(fn)` calls `fn(shown)` whenever it comes or goes, including when the person puts it away.
- **The button is the person's choice, and off until they make it.** `beachVoice.button.set(true)` (or `false`) wherever a page offers it: under a site's options, or beside a write box ("use the beach button"). The choice is kept with their settings on the beach, `settings:<handle>`: the per-person layer of the beach's own `settings` block, at its addresses, where 9 is pages and 9.1 the button (`true` or `false`). So it stands on every page that carries the voice, wherever their name is known; a device that knows no name keeps the choice for itself. Turning it on writes their settings as the page's own text entry would (the first time founding them, locked to their key); turning it off where the button holds them is theirs to commit in it. Never in a frame (the page framing it has its own), and never on a page whose body says `data-beach-button="off"` (its corner is taken).

`scripts/smoke-voice.cjs` proves it on a plain page against a mock beach that refuses a wrong key and ties a name with a passport to that key: with no button, a reading founds the mirror and lands, the key asked once and kept, a second asking nothing; a missing name, a family with no spine and a whole keep of a clock family are refused before anyone is asked; turned on, the button comes and the page hears it, the choice founds the person's settings at 9.1; another device knowing the name shows it unasked, and the same `say` there waits in the button until the person unlocks and commits; turned off where the button holds them, they commit that in it and the page asks no key, and the first device follows; a nameless device keeps the choice to itself; a page that opts out, or a framed one, never shows it; and a mirror is taken down with the kept key. **22 checks**, all hold.

```bash
NODE_PATH=$(npm root -g) npm run smoke:voice     # needs playwright + chromium
```

## Next steps (proposed, not built)

- **The go menu in the button:** the place's doors (its `lighthouse`) and the person's own (their `lists:<handle>` go-menu branch) as two tabs, so a person's menu travels with them to any page.
- **One look:** read the place's `brand` block (Matthew's) to colour the button for the page it's on.
- **Passkeys:** keep the remembered words sealed under a passkey (WebAuthn PRF), so a remembered device needs the person's touch and look-alikes get nothing.
- **A `prove` act on the beach**, and in time **signed writes** (the beach verifies a signature from the passport's published keys), after which not even the beach sees a passphrase.
- **The button's prompt into a block** (`function:button`), so it is tuned on the beach, not in code.

## Files

| file | runs in | holds |
|---|---|---|
| `button.js` | the host page | nothing sensitive: draws the circle, its grip and the widening edge, places the window, relays layout and requests |
| `frame.html` · `frame.js` · `frame.css` | the iframe (the beach's origin) | the window: the handle, passphrase and key for this tab; the ask; the staged writes and their commits; settings |
| `unlock.html` · `unlock.js` | a top-level window (the beach's origin) | where words are typed; "remember on this device" |
| `ear.html` · `ear.js` | a top-level window (the beach's origin) | the person's ear, watch by watch; following and ending, under their own words |
| `voice.js` | the host page | the page's side: one call for a person's words, through the button where it is, else the page's own text entry (the key the browser keeps for it, in the page's storage); the person's choice of button, in their settings on the beach |

These are static files beside the handler. They add no endpoint and never touch the wire: the frame calls the same `/.well-known/pscale-beach` every client calls.
