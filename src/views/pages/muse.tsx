import type { Child } from 'hono/jsx';
import { PageHead } from '../components/head';

/** The current Muse Companion release. Bump these together when a new installer is on download.huismax.com. */
const VERSION = '0.4.5';
const SETUP = `https://download.huismax.com/MuseCompanion-Setup-${VERSION}.exe`;
const REPO = 'https://github.com/huismaxx/companion';
const TOKENS = 'https://gadgets.muse.ai/settings/sdk-tokens';

const BOARDS = {
  hosyond: { name: 'Hosyond ESP32-S3 3.5″ Touchscreen', url: 'https://www.amazon.com/dp/B0H28X8SQ4' },
  stick: { name: 'M5Stack M5StickS3', url: 'https://www.amazon.com/dp/B0GWHN8HK3' },
};

const ext = { target: '_blank', rel: 'noopener noreferrer' };
const Out = ({ href, children }: { href: string; children: Child }) => (
  <a class="mu-link" href={href} {...ext}>
    {children}
    <span aria-hidden="true"> ↗</span>
  </a>
);
const Path = ({ children }: { children: Child }) => <span class="mu-path mono">{children}</span>;

/** A screenshot of Muse Companion's own window (500×820, taken at 2×). */
const Shot = ({ src, alt, caption }: { src: string; alt: string; caption: Child }) => (
  <figure class="mu-shot">
    <img src={`/muse/${src}.webp`} width="500" height="820" alt={alt} loading="lazy" decoding="async" />
    <figcaption class="mono">{caption}</figcaption>
  </figure>
);

const Step = ({ n, title, children, shots }: { n: number; title: string; children: Child; shots?: Child }) => (
  <li class={`mu-step${shots ? ' has-shots' : ''}`}>
    <div class="mu-step-text">
      <p class="mu-step-n mono">step {String(n).padStart(2, '0')}</p>
      <h3>{title}</h3>
      {children}
    </div>
    {shots && <div class="mu-shots">{shots}</div>}
  </li>
);

/** yes / no / a note, for the board comparison. */
const Y = ({ children }: { children?: Child }) => (
  <td>
    <span class="mu-yes" aria-label="yes">●</span> {children}
  </td>
);
const N = ({ children }: { children?: Child }) => (
  <td class="mu-no">
    <span aria-label="no">—</span> {children}
  </td>
);

/** /muse: how to turn a supported ESP32 board into a Muse gadget with Muse Companion. */
export const Muse = () => (
  <div class="muse-page">
    <PageHead crumb="muse gadget" title="Build your own Muse gadget" class="mu-head">
      <p class="page-intro">
        Turn an ESP32 board into a Muse gadget in a few minutes. No coding, no ESP-IDF, no command line. Plug the board into a
        Windows PC, paste your Muse SDK token, press <b>INSTALL</b>, and Muse Companion does the rest.
      </p>
      <div class="mu-cta">
        <a class="mu-download" href={SETUP}>
          <span>download Muse Companion</span>
          <span class="mono">v{VERSION} · Windows</span>
        </a>
        <Out href={REPO}>source on GitHub</Out>
      </div>
      <p class="mu-meta mono">windows 10 (1809+) or 11 · 64-bit · free · open source</p>
    </PageHead>

    <section class="mu-section" aria-labelledby="mu-why">
      <h2 id="mu-why" class="mu-h2">What it is</h2>
      <div class="mu-prose">
        <p>
          Meta open-sourced the Muse Gadget SDK, so anyone can build a Muse-powered device on ESP32 hardware. The SDK is flexible, but
          setting a board up by hand means installing ESP-IDF, configuring the SDK, building firmware, finding the serial port,
          flashing, and pairing.
        </p>
        <p class="mu-flow mono">
          <s>ESP-IDF → configure → build → serial port → flash → monitor → pair</s>
          <br />
          connect → token → install
        </p>
        <p>
          Muse Companion is a small Windows app that does all of it for the boards below. It also stays in the tray afterwards: it gives
          your gadget a voice (Muse sends gadgets text; Companion turns it into speech on the board) and, on the touchscreen board,
          shows what your computer is playing.
        </p>
      </div>
    </section>

    <section class="mu-section" aria-labelledby="mu-boards">
      <h2 id="mu-boards" class="mu-h2">Pick a board</h2>
      <p class="mu-lead">Two boards are supported. Others won't work: the firmware is built for these two.</p>
      <div class="mu-boards">
        <article class="mu-board">
          <p class="mu-tag mono">recommended · most compatible</p>
          <h3>{BOARDS.hosyond.name}</h3>
          <p>
            A desktop Muse with a big touchscreen for the character, captions and the music page. Everything Muse Companion does works
            on this board. Connect the speaker to it before you start.
          </p>
          <Out href={BOARDS.hosyond.url}>on Amazon</Out>
        </article>
        <article class="mu-board">
          <p class="mu-tag mono">small · battery powered</p>
          <h3>{BOARDS.stick.name}</h3>
          <p>
            A pocket-sized Muse with a built-in battery, so it works away from the USB cable. The screen is small (135×240) and not a
            touchscreen, there's no music page, and the character is always Muse.
          </p>
          <Out href={BOARDS.stick.url}>on Amazon</Out>
        </article>
      </div>

      <div class="mu-table-wrap">
        <table class="mu-table">
          <thead>
            <tr>
              <th scope="col" />
              <th scope="col">Hosyond 3.5″</th>
              <th scope="col">M5StickS3</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Screen</th>
              <td>3.5″</td>
              <td>small, 135×240</td>
            </tr>
            <tr>
              <th scope="row">Touchscreen</th>
              <Y />
              <N />
            </tr>
            <tr>
              <th scope="row">Music page (now playing, cover, controls)</th>
              <Y />
              <N />
            </tr>
            <tr>
              <th scope="row">Choice of character</th>
              <Y />
              <N>Muse only</N>
            </tr>
            <tr>
              <th scope="row">"Hey Muse" and voice input</th>
              <Y />
              <Y />
            </tr>
            <tr>
              <th scope="row">Speaks Muse's replies</th>
              <Y>with the speaker connected</Y>
              <Y />
            </tr>
            <tr>
              <th scope="row">Built-in battery</th>
              <N>USB powered</N>
              <Y />
            </tr>
            <tr>
              <th scope="row">Compatibility</th>
              <td>full</td>
              <td>core features</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="mu-section" aria-labelledby="mu-need">
      <h2 id="mu-need" class="mu-h2">What you'll need</h2>
      <ul class="mu-list">
        <li>One of the two boards above (and, for the Hosyond, its speaker)</li>
        <li>
          A USB-C <b>data</b> cable. Many cables that come with chargers only carry power; if the board isn't found, try another cable.
        </li>
        <li>A Windows 10 or 11 PC (64-bit)</li>
        <li>The Muse app on your phone, and a Muse account</li>
        <li>A Muse Gadget SDK token (step 1)</li>
        <li>A 2.4 GHz Wi-Fi network for the gadget</li>
      </ul>
    </section>

    <section class="mu-section" aria-labelledby="mu-steps">
      <h2 id="mu-steps" class="mu-h2">Set it up</h2>
      <ol class="mu-steps">
        <Step n={1} title="Get your Muse SDK token">
          <p>
            Every Muse gadget needs an official SDK token. Sign in at <Out href={TOKENS}>gadgets.muse.ai</Out> with your Muse account, open{' '}
            <Path>Account → SDK tokens</Path>, create a token and copy it. It starts with <code>mgst_</code>.
          </p>
        </Step>

        <Step n={2} title="Install Muse Companion">
          <p>
            <a class="mu-link" href={SETUP}>
              Download the installer
            </a>{' '}
            (2.4 MB) and run it. It fetches the app (about 24 MB), installs it, and opens it. No Python or ESP-IDF needed. It asks for
            administrator rights to install into Program Files.
          </p>
          <p class="mu-note">
            The installer isn't code-signed yet. If SmartScreen warns, choose <Path>More info → Run anyway</Path>. On PCs with Smart App
            Control turned on, Windows blocks unsigned installers outright.
          </p>
        </Step>

        <Step
          n={3}
          title="Paste the token and plug in the board"
          shots={<Shot src="setup-ready" alt="Muse Companion's Setup tab with a token entered and the board shown as READY · COM5" caption="token saved · board ready on COM5" />}
        >
          <p>
            In the <b>SETUP</b> tab, paste your token into <b>SDK TOKEN</b>. It's saved on this computer.
          </p>
          <p>
            <b>Hosyond:</b> connect the speaker to the board first, then the board to the PC. <b>M5StickS3:</b> connect it directly.
          </p>
          <p>
            After a few seconds <b>BOARD</b> changes from <i>PLUG IN YOUR BOARD</i> to <i>READY · COM5</i> (any port number). Companion
            finds the port and checks it really is a supported ESP32-S3 by itself.
          </p>
        </Step>

        <Step
          n={4}
          title="Choose a character"
          shots={<Shot src="sticks3-setup" alt="Setup tab with a StickS3 connected: the character card says StickS3 · Muse only" caption="StickS3: Muse only" />}
        >
          <p>On the Hosyond, pick the character its screen will show (you can change it later). The M5StickS3 always uses Muse, so there's nothing to choose.</p>
        </Step>

        <Step
          n={5}
          title="Press INSTALL"
          shots={
            <>
              <Shot src="installing" alt="The INSTALL button filling up at 62%, Installing ES3C35P…" caption="installing · 62%" />
              <Shot src="installed" alt="Under the button: Installed ES3C35P. Now pair MuseGadget-3F9A21 in the Muse app." caption="done: pair it next" />
            </>
          }
        >
          <p>
            Companion writes the firmware and your token to the board. It takes a minute or two. <b>Don't unplug the board while it
            runs.</b>
          </p>
          <p>
            When it's done it says <i>Installed …</i> and the name your gadget will have in the Muse app, like <code>MuseGadget-3F9A21</code>.
            (The Hosyond shows up as <i>ES3C35P</i>, the board's own model name.)
          </p>
        </Step>

        <Step n={6} title="Turn on Developer mode in the Muse app">
          <p>
            On your iPhone or Android phone, open the Muse app and go to <Path>Settings → Devices</Path>. Turn on <b>Developer mode</b>:
            it lets the app find gadgets built with the Gadget SDK.
          </p>
        </Step>

        <Step
          n={7}
          title="Add your gadget"
          shots={<Shot src="online-update" alt="The status pill says ONLINE and the big button now says UPDATE" caption="online · INSTALL is now UPDATE" />}
        >
          <p>
            Still in <Path>Settings → Devices</Path>, tap <b>+</b> (top right). Your board appears as <code>MuseGadget-XXXXXX</code>.
            Select it and follow the app: it may ask you to confirm on the board with its button, then pick a <b>2.4 GHz</b> Wi-Fi network.
          </p>
          <p>
            Once it's on Wi-Fi, Companion finds it and the pill at the top says <b>ONLINE</b>. You're done: say "Hey Muse".
          </p>
          <p class="mu-note">
            Leave Muse Companion running (it sits in the tray and starts with Windows): it's what speaks Muse's replies on the board, so the
            PC and the gadget need to be on the same network.
          </p>
        </Step>
      </ol>
    </section>

    <section class="mu-section" aria-labelledby="mu-custom">
      <h2 id="mu-custom" class="mu-h2">Make it yours</h2>
      <div class="mu-features">
        <div class="mu-feature">
          <h3>Voice</h3>
          <p>
            Muse sends gadgets text. Companion reads it aloud on the board, in one of 25 voices: natural ones, accents, and silly ones
            (Movie Trailer, Evil Overlord, Chipmunk…). Every voice reads Chinese too. Set the speed, choose online (natural, streaming) or
            Windows offline speech, change the wake word, and use <b>TEST BOARD SPEAKER</b> to check the sound. Speaker and volume are set on
            the board, in its <Path>SYS</Path> menu.
          </p>
          <Shot src="voice" alt="The VOICE tab: speak replies toggle, test board speaker, speed, speech engine, wake word, and voice presets" caption="the VOICE tab" />
        </div>
        <div class="mu-feature">
          <h3>Music · Hosyond only</h3>
          <p>
            The board's MUSIC page shows what this computer is playing, cover included, with play, pause, skip and seek on its touchscreen.
            Turn it on or off in the <b>MUSIC</b> tab. The M5StickS3 has no music page.
          </p>
          <div class="mu-pair">
            <Shot src="music" alt="The MUSIC tab showing a track playing in Spotify" caption="Hosyond" />
            <Shot src="sticks3-music" alt="The MUSIC tab with a StickS3: Music is not supported on StickS3" caption="M5StickS3" />
          </div>
        </div>
        <div class="mu-feature">
          <h3>Characters · Hosyond only</h3>
          <p>
            Pick a different face for your gadget in <b>SETUP</b> and press <b>UPDATE</b>. An update keeps the pairing and Wi-Fi, so there's
            nothing to redo in the Muse app.
          </p>
        </div>
        <div class="mu-feature">
          <h3>Updates</h3>
          <p>
            Companion checks for a new version when it starts and every six hours (or press <b>CHECK FOR UPDATES</b>). Updating the app never
            touches the board. To put new firmware on the board, press <b>UPDATE</b>.
          </p>
        </div>
      </div>
    </section>

    <section class="mu-section" aria-labelledby="mu-help">
      <h2 id="mu-help" class="mu-h2">Troubleshooting</h2>
      <div class="mu-faq">
        <details>
          <summary>The board isn't found (it stays on PLUG IN YOUR BOARD)</summary>
          <ul class="mu-list">
            <li>Try another USB-C cable: it must carry data, not just power.</li>
            <li>Unplug the board and plug it back in, or use another USB port.</li>
            <li>Close other programs that might be using the board's serial port (Arduino IDE, serial monitors, other flashers).</li>
            <li>Some USB bridges need their maker's driver (CH340, CP210x).</li>
            <li>Restart Muse Companion.</li>
          </ul>
        </details>
        <details>
          <summary>Installing fails</summary>
          <p>Unplug the board, plug it back in, and press INSTALL again. If it still fails, put the board in download mode first:</p>
          <ul class="mu-list">
            <li>
              <b>Hosyond:</b> hold <b>BOOT</b>, tap <b>RST</b>, let go of BOOT.
            </li>
            <li>
              <b>M5StickS3:</b> hold the side button until the green light flashes.
            </li>
          </ul>
        </details>
        <details>
          <summary>It installed, but the Muse app doesn't list it</summary>
          <p>
            Check that <Path>Settings → Devices → Developer mode</Path> is on, then tap <b>+</b> and look for a device starting with{' '}
            <code>MuseGadget-</code>.
          </p>
        </details>
        <details>
          <summary>It's paired but doesn't answer, or doesn't speak</summary>
          <ul class="mu-list">
            <li>The gadget needs Wi-Fi with Internet access. Only 2.4 GHz networks work.</li>
            <li>Spoken replies need Muse Companion running on a PC on the same network. If the MUSIC tab says the board isn't found on Wi-Fi, press RECONNECT.</li>
            <li>
              In the VOICE tab, <b>TEST BOARD SPEAKER</b> tells you if the board's speaker is muted or at zero volume (fix it in the board's{' '}
              <Path>SYS → Sound</Path>).
            </li>
            <li>Wait for a reply to finish before saying "Hey Muse" again.</li>
          </ul>
        </details>
        <details>
          <summary>I entered the wrong SDK token</summary>
          <p>Paste the right one in SETUP and press UPDATE (or INSTALL). If a token has been exposed, revoke it in your Muse account and create a new one.</p>
        </details>
      </div>
    </section>

    <section class="mu-section" aria-labelledby="mu-privacy">
      <h2 id="mu-privacy" class="mu-h2">Your token and your data</h2>
      <div class="mu-prose">
        <p>
          Your SDK token is used on your computer only. Companion writes it into the board's firmware settings. It isn't uploaded to our
          server or stored in any cloud of ours. Still, treat it like a password; if it's exposed, revoke it and make a new one.
        </p>
        <p>
          The finished gadget talks to Muse over your Wi-Fi like any Muse device. With the online speech engine, the text of Muse's replies is
          turned into speech by Microsoft's online voices; choose <b>Windows · offline</b> in the VOICE tab to keep that on your PC.
        </p>
      </div>
    </section>

    <section class="mu-section" aria-labelledby="mu-oss">
      <h2 id="mu-oss" class="mu-h2">Open source</h2>
      <div class="mu-prose">
        <p>
          Muse Companion is open source and built on Meta's open-source Muse Gadget SDK, released under the Apache License 2.0 (some included
          third-party components keep their own licenses; Meta's license excludes the Jollybot avatar). You're welcome to read the code, add
          boards, make characters, or build your own version: <Out href={REPO}>github.com/huismaxx/companion</Out>.
        </p>
        <p class="mu-note">
          Muse Companion is an independent community project for personal, non-commercial use. It isn't an official Meta product and isn't
          affiliated with or endorsed by Meta. Muse, the Muse Gadget SDK and Meta are trademarks of their owners. Flashing firmware changes your
          board and is done at your own risk; only flash firmware meant for your board.
        </p>
      </div>
    </section>

    <section class="mu-section mu-end">
      <h2 class="mu-h2">Ready?</h2>
      <p class="mu-lead">Pick a board, get your token, plug it in, press INSTALL. Your Muse gadget is a few minutes away.</p>
      <div class="mu-cta">
        <a class="mu-download" href={SETUP}>
          <span>download Muse Companion</span>
          <span class="mono">v{VERSION} · Windows</span>
        </a>
        <Out href={BOARDS.hosyond.url}>Hosyond 3.5″</Out>
        <Out href={BOARDS.stick.url}>M5StickS3</Out>
      </div>
    </section>
  </div>
);
