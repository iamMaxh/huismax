# huismax.com: Site Features Reference

Knowledge file for Max's AI Assistant (the site's Live Chat agent). It describes what the public site does and how visitors use it.
Verified against the production code and the live site on **2026-09-29**.

**Status legend**
- **LIVE**: works in production today.
- **PARTIAL**: built and working, but waiting on content or setup (for example, an empty gallery).
- **COMING SOON**: announced or placeholder in the UI, not usable yet.
- **EXPERIMENTAL**: works only under limited or manual conditions and hasn't been used publicly yet.

> Max edits all content (text, lists, photos, DJ sessions) whenever he wants, and he can switch individual pages off.
> A switched-off page returns the 404 page and disappears from menus. Anything under "Current content" is a snapshot, so hedge on specifics.

---

## 1. Public pages and routes

| URL | Page | What it's for | Status |
|---|---|---|---|
| `/` | Home | "WHO IS MAX?" intro, Max's current status, what he's listening to, his identities, and entry points | LIVE |
| `/dj` | huismax dj channel | Max's DJ channel: live sets (when on air) and an archive of recorded sessions | PARTIAL (no sessions yet) |
| `/music` | Music | Live Spotify listening (now playing, recently played, on repeat) and Max's favourite artists | LIVE |
| `/photographer` | Photographer | Max's photography gallery | PARTIAL (no photos yet) |
| `/hiking` | Hiking | Max's hiking photo album (same gallery as Photographer) | PARTIAL (no photos yet) |
| `/vibe-coder` | Vibe coder | Max's software projects, with status | LIVE |
| `/now` | Now | What Max is doing, learning and building right now | LIVE |
| `/reply` | Reply | The contact form for sending Max a private message | LIVE |
| any unknown path | 404: "WHERE IS MAX?" | Shows the requested path and links to every open page | LIVE |

**Redirects:** `/lab` goes to `/reply` and `/trail-runner` goes to `/hiking` (both permanent). `www.huismax.com` goes to `huismax.com`. A trailing slash is removed, so `/music/` becomes `/music`.

**Pages that don't exist:** `/projects`, `/lab` (redirect only), `/about`, `/contact`, `/blog`, `/shop`. Projects live at `/vibe-coder` and contact happens through `/reply`.

---

## 2. Site-wide interface (every page) · LIVE

- **Header:**
  - The `huismax_` wordmark links home.
  - The nav links are home · music · dj · now · reply. On screens 720px wide or narrower they're hidden, so visitors use **menu** instead.
  - A red **● LIVE** badge (it links to `/dj`) shows only while Max is live.
  - The **live chat** button reads just "chat" on very narrow phones.
  - The **menu** button opens the menu.
- **Menu (full-screen overlay):**
  - The numbered pages Home, Music, DJ, Now and Reply.
  - **switch theme**: black or white. The default follows the device setting and the choice is remembered in the browser.
  - **random**: jumps to a random page.
  - **copy link**: copies the current URL.
  - Photographer, Hiking and Vibe coder are **not** in the menu. Visitors reach them from the homepage identity list, the command palette, **random**, the 404 page, or the URL directly.
- **Command palette (hidden easter egg):**
  - Press **⌘K / Ctrl+K** or **/** (when not typing in a field).
  - Fuzzy "go to…" search over all open pages, including Photographer, Hiking and Vibe coder.
  - Actions: **listen live** (only while live), **stop audio** (while audio is loaded), **switch theme**, **somewhere random**, **copy link**.
  - Move with ↑/↓, open with Enter, close with Esc.
- **Bottom audio bar (persistent player):**
  - When nothing is playing, it shows Max's current or last Spotify track. If there's nothing to show, it slides out of view.
  - While Max is live, it shows LIVE · huismax dj channel and a **listen** button.
  - While a DJ mix plays, it shows the title, a progress bar (click it to seek) and pause/resume.
  - **Space** toggles play/pause when focus isn't on a link, button or field.
- **Seamless navigation:** moving between pages doesn't reload the site, so **audio keeps playing and the chat stays open** while visitors browse.
- **Page header:** a breadcrumb `index / <page>`, where "index" links home. Each page can show a one-line intro written by Max.
- **Footer:** "huismax © 2026", plus any external links Max adds (currently none).
- **Accessibility:** a "skip to content" link, screen-reader labels, and reduced-motion support (animations become still frames).

---

## 3. Live Chat: Max's AI Assistant · LIVE

**How to open it:**
- The **live chat** button in the header, on every page.
- The **"chat with max's ai assistant →"** button on the homepage.
- Clicking either button again closes the chat.

**Layout:**
- **Desktop and tablet:** a side panel on the right, below the header. The page stays usable, and visitors can keep browsing with the chat open.
- **Phones (560px wide or narrower):** full screen. **close**, Esc or the back button closes it.

**Inside the panel:**
- Title "Max's AI Assistant", subtitle *"an ai, not max himself"*.
- Greeting: *"Hi, I'm Max's AI assistant. What would you like to know about him?"*
- Suggested questions, shown only in an empty chat: **Who is Max?**, **What is he building?**, **How can I reach him?**
- Input field with the placeholder "ask about max". Messages can be up to 2,000 characters. Enter sends, Shift+Enter adds a new line, and Chinese/Japanese input methods work.
- Answers stream in word by word after a "thinking" indicator. Visitors can press **stop ■** (or Esc once) to stop an answer; what arrived so far is kept and marked "stopped.". A second Esc closes the panel.
- Only one question can run at a time.
- **new chat** clears the conversation.
- Footer note: *"answers can be wrong. this chat is kept in this tab only."*

**Memory and privacy:**
- The conversation is kept only in the visitor's current browser tab. It survives a reload and disappears when the tab closes.
- The browser keeps the last 60 messages, but **only the last 8 messages go to the assistant as context** with each question.
- The chat window has no "send to Max" feature. Anyone who wants to reach him should use **/reply**.

**Error messages visitors may see:**
- "Too many requests right now. Try again in a moment."
- "Max's AI assistant is temporarily unavailable."
- "This response is taking longer than expected. Please try again." (no first word within about 90 seconds, or about 45 seconds of silence mid-answer)
- "Couldn't reach Max's AI assistant. Check your connection and try again."
- "The answer was cut off. Please try again."
- "Something went wrong on our side. Please try again."

**How the assistant's answers are displayed (write for this):**
- Only **paragraphs** (separated by a blank line) and **simple lists** (`-`, `*`, `•` or `1.`) are rendered.
- Bold, italics, backticks and headings are stripped to plain text, and HTML is shown literally.
- **Links become clickable only when they point to one of these:**
  - An open page path: `/music`, `/dj`, `/now`, `/reply`, `/photographer`, `/hiking`, `/vibe-coder`. The homepage `/` works only inside a Markdown link.
  - Any `https://huismax.com/...` URL.
  - `https://tapical.us`, `https://open.spotify.com/...`, or any link shown in the site footer or on the homepage.
- Links that stay **plain text**:
  - Other domains, `http://` links, and `/lab`.
  - A path to a page that's switched off.
- A bare path followed by `#` or `?` links only the path part. For a photo deep link, use the full `https://huismax.com/photographer#<id>` URL.
- Markdown links like `[Music](/music)` work: the label shows, and it's clickable if the target is allowed.
- On phones and small tablets (720px wide or narrower), tapping a site link in the chat closes the chat and opens the page. Reopening the chat shows the same conversation. External links open in a new tab.

---

## 4. Homepage (`/`) · LIVE

- **Headline:**
  - "WHO IS MAX?" types itself out with a blinking cursor, over a faint "code rain" of falling glyphs.
  - An optional tagline sits under it (currently none).
- **Chat button:** "chat with max's ai assistant →" opens Live Chat.
- **Status block:**
  - **Status line:** a breathing dot and Max's personal status, which he sets by hand. Examples: "building", "locked in", "touching grass", "afk", or any custom text.
  - **Spotify card:** album art, a state label ("now playing", "paused" or "last played · 2 h ago"), the track, the artist, and a progress bar while playing or paused. Clicking it opens the track on Spotify.
  - A **"spotify profile ↗"** link.
  - A manual "♪ title — artist" line appears when Max sets one and Spotify isn't showing a track.
  - While Max is live, the whole block is replaced by **● LIVE** and a "huismax dj channel" link to `/dj`. It returns when the set ends.
- **Identity list:**
  - Numbered rows (01, 02, …), each linking to its page.
  - Hovering or focusing a row types a short caption and shifts the page's mood.
  - A row can have a small external link beside it. The Vibe coder row links to "Tapical ↗" at tapical.us.
  - Keyboard: ↑/↓ moves between rows and keys 1–9 jump to a row.
- **Index grid:**
  - **now:** status and Now items (links to `/now`).
  - **listening:** current or last Spotify track (links to `/music`).
  - **building:** project names (links to `/vibe-coder`).
  - **elsewhere:** music, dj and reply.
- **Update timing:** status and live state refresh about every 15 seconds and Spotify about every 20 seconds. A change can take up to about a minute to appear.

**Current content (snapshot):**
- Status: "lowkey busy".
- Identities: 01 DJ, 02 Photographer, 03 Vibe coder. Hiking is currently **not** listed on the homepage.

---

## 5. DJ: huismax dj channel (`/dj`)

**Console (top of the page):**
- A large audio visualizer.
- A label that reads "now playing" when live, "latest · 00N" for the newest session, or "archive".
- The session title.
- An **on air** clock that counts time since the live set started. It shows `--:--:--` when not live.
- While live, a **listening** count (people tuned in right now) and a **volume** control.
- Buttons:
  - **listen live →**: shown only while live. It becomes **pause**, then **resume** (which rejoins the live point).
  - **play →**: plays the newest playable archived session. It's hidden while live.

**Archive playback · PARTIAL:**
- Sessions are listed newest number first.
- Each session has:
  - A ▶/❚❚ play-pause button.
  - A cover image, a 3-digit number and a title.
  - Date · duration and a description.
  - A collapsible **tracklist** that shows the track count.
  - An **"audio file ↗"** link that opens the raw audio in a new tab.
- A session without audio has a disabled ▶ ("no audio yet").
- Playback runs in the global player, so it continues while visitors browse. The bottom bar has the progress bar and seeking.
- Possible errors: "could not load this mix", "playback blocked".
- **Current content (snapshot):** the archive is empty. The page shows **"NO ARCHIVE YET · first transmission soon"** (COMING SOON).

**Live sets · LIVE:**
- Max streams from his own radio server. The site goes live **on its own** when he starts streaming and returns to normal when he stops, usually within 15–30 seconds, with no reload needed.
- While he's live:
  - A LIVE badge appears in the header, on the /dj page, on the homepage (in place of his status) and in the bottom bar.
  - The DJ console shows "now playing", the on-air clock, the listener count, **listen live** and volume.
  - The palette offers **listen live**.
- Audio never starts by itself: visitors press **listen live** (browsers require a click). It keeps playing while they browse other pages.
- Volume is remembered on the visitor's device. On iPhone, the volume control appears once the stream is playing; otherwise use the phone's buttons.
- When a set ends, the player stops and the page goes back to the archive.
- If the stream fails: "could not reach the stream".

**Not available:**
- No schedule or calendar of upcoming sets, and no notifications or reminders.
- No chat or requests during sets, and no booking form.
- Live sets are not added to the archive automatically. Max adds sessions himself.

---

## 6. Music and Spotify (`/music`) · LIVE

- **Spotify card:**
  - Shows "now playing", "paused" or "last played", with artwork, track, artist, album and a live progress bar.
  - A card showing the last-played track also shows how long ago it played.
  - Clicking it opens the track on Spotify.
- **recently played:** up to 8 recent tracks with duplicates removed, each with "x min/h/d ago".
- **on repeat:** Max's top 5 tracks from roughly the last 4 weeks.
- **artists:** Max's hand-picked favourite artists (they can link out).
- **in rotation** and **featured:** optional hand-picked lists. They appear only when Max adds items (currently hidden).
- A **"spotify profile ↗"** link.
- **Empty or error states:**
  - "loading"
  - "nothing played lately."
  - "not connected yet."
  - "spotify is not answering. try again in a bit."
  - "not available right now."
  - Elsewhere on the site: "spotify is quiet" and "quiet right now".
- **Limitation:** the site **does not play Spotify audio**. Track links open Spotify, and the only audio the site plays itself is the DJ channel.

**Current artists (snapshot):** Kanye West, Daniel Caesar, Chris Brown, The Kid LAROI, Usher.

---

## 7. Photography and Hiking galleries (`/photographer`, `/hiking`) · PARTIAL

Both pages work the same way.

- **Frames:**
  - Seven frames are always laid out. Empty ones show **"NOT 1" … "NOT 7"**. These are placeholders, not clickable.
  - Published photos fill the frames in order. With more than 7 photos, every photo shows.
- **Features that appear once there are photos:**
  - A toolbar with the frame count and a **grid / index** toggle.
  - **Grid:** each photo has a number, title, location · date and caption.
  - **Index:** a table (no., title, location, date). On desktop, a thumbnail preview follows the cursor.
  - **Viewer:** clicking a photo opens a full-screen viewer that loads a preview first, then the full image. It shows a counter ("03 / 12"), title, caption, place and date.
  - **Navigating the viewer:** ←/→ keys, arrow buttons, or swipe on touch.
  - **Closing the viewer:** Esc, the "esc" button, or a click outside the photo.
  - **Share a photo:** while a photo is open, the URL becomes `…/photographer#<photo-id>`. Opening that link opens that photo directly.
- **Not available:** downloads, likes, comments, print sales, and camera/EXIF details (camera data is removed on upload).
- **Current content (snapshot):** no photos are published on either page yet. Both show the 7 empty frames (photos are COMING SOON).

---

## 8. Projects (`/vibe-coder`), Now (`/now`) and "Lab"

**Vibe coder · LIVE:**
- A numbered project list. Each project shows:
  - Its name. With a link, the name shows ↗ and opens in a new tab.
  - A **status** badge: `building`, `live`, `paused` or `soon`.
  - An optional note.
- Hovering a project (desktop) or focusing it with the keyboard shows a terminal-style preview that types out the name, domain, status and note.
- Keyboard: ↓ enters the list right after the page opens, and ↑/↓ moves within it.
- An empty list shows "nothing public right now."
- **Current (snapshot):** 01 **Tapical**: status *building*, https://tapical.us. The site shows only the project's name, link and status, so don't invent details about Tapical.

**Now · LIVE:**
- **right now:** Max's hand-set status (the same one as on the homepage).
- Then Max's own list of label/text lines, which can link out.
- **listening:** the current or last Spotify track, or "quiet right now".
- "updated YYYY-MM-DD": the date Max last updated his status.
- **Current (snapshot):** right now "lowkey busy" · learning "DJ transitions" · building "tapical.us ↗" · updated 2026-09-28.

**Lab:** there is **no Lab page**. `/lab` redirects to `/reply`.

---

## 9. Reply: contact Max (`/reply`) · LIVE

**The form:**
- **message**: required, up to 2,000 characters, with a live "0 / 2000" counter.
- **name**: optional, up to 60 characters.
- **email**: optional. The label reads "if you want an answer".

**How it works:**
- Press **send →**. The button shows "sending…", then **"sent. thank you."** The text is cleared only after a successful send and kept on any error.
- Messages go privately to Max. They are never published.
- **Without an email address, Max has no way to answer.**
- **Limits per visitor:** one message a minute and 10 a day. A site-wide limit can briefly pause the form.

**Messages visitors may see:**
- "write something first"
- "2000 characters max"
- "that email doesn't look right"
- "one message a minute, please"
- "that's 10 today. try again tomorrow"
- "too many messages right now. try again later"
- "replies are offline right now"
- "could not send. try again in a bit."
- "could not send. check your connection."

**Not available:** attachments, a confirmation email to the sender, and any promised reply time.

Use `/reply` for everything contact-related: collaborations, DJ bookings, photography, questions about projects. There's no separate booking or contact system.

---

## 10. Looks available but isn't (yet)

| What visitors see | Reality |
|---|---|
| "NOT 1 … NOT 7" frames on Photographer or Hiking | Empty placeholders for future photos. Not clickable. |
| DJ archive "NO ARCHIVE YET · first transmission soon" | No sessions published yet. |
| DJ "on air --:--:--" clock | Runs only while Max is live. |
| "listen live" / LIVE badge / listener count | Appear only while Max is streaming. |
| Small waveform bars beside each DJ session | Decorative, not the real audio waveform. |
| DJ console and audio bar visualizers | Real only while audio plays and the audio host allows analysis. Otherwise a simulated animation. |
| Disabled ▶ on a DJ session | That session has no audio attached. |
| Spotify track cards | Links to Spotify, not an in-site player. |
| "in rotation" / "featured" music sections | Supported but currently empty, so hidden. |
| `/lab` | Not a page. Redirects to Reply. |
| Live Chat | An AI assistant. The website gives it no way to message Max, book anything, or take payments. Contact goes through `/reply`. |

---

## 11. Important limitations for the assistant

- **No visitor accounts:** no login, profiles, comments, likes, newsletter, search, shop, blog, event calendar or booking system.
- **Don't invent content.** Describe DJ sessions, photos, projects and details only as they appear on the site. When unsure, point visitors to the page itself.
- **Don't assume Max is live or listening.** Live state and Spotify change constantly. Say "check the LIVE badge or /music", or read the live endpoints below.
- **Snapshots go stale.** Max can edit text, reorder or hide lists, publish photos or sessions, and switch pages off. A switched-off page becomes a 404 and leaves the menus.
- **Mobile differences:**
  - Header links are hidden at 720px wide or narrower, so visitors use **menu**.
  - The chat is full screen at 560px or narrower.
  - "live chat" reads "chat" at 420px or narrower.
- **Finding the hidden pages:** Photographer, Hiking and Vibe coder aren't in the menu. Hiking is currently reachable only through `/hiking`, the ⌘K palette, "random", or the 404 page's link list.
- **Chat memory:** you only see the last 8 messages of a conversation, and it's gone when the visitor closes the tab.
- **Contacting Max always means `/reply`,** with an email address if the visitor wants an answer.
- **Keyboard shortcuts:**
  - Anywhere: ⌘K/Ctrl+K or `/` opens the palette, and Space plays or pauses audio.
  - Homepage: ↑/↓ and 1–9 move through identities.
  - Vibe coder: ↓ and ↑ move through the project list.
  - Photo viewer: ←/→ steps through photos and Esc closes it.
  - Chat: Enter sends, Shift+Enter adds a new line, Esc stops an answer or closes the chat.

---

## 12. Useful public URLs

| Feature | URL |
|---|---|
| Home / Live Chat button | https://huismax.com/ |
| DJ channel (live and archive) | https://huismax.com/dj |
| Music and Spotify | https://huismax.com/music |
| Photography | https://huismax.com/photographer |
| Hiking | https://huismax.com/hiking |
| Projects | https://huismax.com/vibe-coder |
| Now | https://huismax.com/now |
| Contact form | https://huismax.com/reply |
| Tapical (Max's project) | https://tapical.us |
| Max's Spotify profile | https://open.spotify.com/user/31tzngiyvyxa4yh6ntw4zewh5h7e |

**Live data (public, read-only JSON):** the assistant can read these to answer "is Max live?" or "what's he listening to?". Send visitors to the pages rather than to these URLs.
- `https://huismax.com/api/presence`: `live.isLive`, `live.sessionTitle`, `live.startedAt`, `status` (Max's status line) and `listening` (a manual note, if set).
- `https://huismax.com/api/dj-status`: `live` (Max's radio is on air) and `listeners` (people tuned in).
- `https://huismax.com/api/spotify/now`: `state` (`playing` / `paused` / `recent` / `idle`, or an unavailable state) and `track` (name, artists, album, url, playedAt).
- `https://huismax.com/api/spotify/recent`: `recent` (up to 8 recently played tracks) and `onRepeat` (top 5 tracks from about the last 4 weeks).
