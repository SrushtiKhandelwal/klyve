import type { CSSProperties, ReactNode } from "react";
import { SparklesIcon, TrendingUpIcon } from "lucide-react";
import { Glyph } from "@/components/brand/glyph";

// The hero's right-hand picture: three real-looking emails from three
// (made-up) brands, each in its own colours, fanned out on a soft mint block.
// It says "every brand can look like itself" without a single word.
//
// Everything scales with the collage's own width (container query units,
// "cqw"), so it looks the same on a phone and on a wide screen.
// Pure decoration: hidden from screen readers (the hero text says it all).

const float = (seconds: number) => ({ "--float-delay": `${seconds}s` }) as CSSProperties;

export function EmailCollage() {
  return (
    <div aria-hidden="true" className="relative mx-auto aspect-[1/1.08] w-full max-w-[620px] [container-type:inline-size]">
      {/* Flat colour shapes behind the emails (no blur, no glow). */}
      <div className="absolute inset-[7%_3%_5%_6%] rounded-[2.2rem] bg-[#DCEFE3]" />
      <div className="absolute top-[-3%] right-[-2%] size-[20cqw] rounded-full bg-[#F6C453]" />
      <div className="absolute bottom-[0%] left-[0%] h-[22cqw] w-[34cqw] rounded-[1.4rem] bg-[#C9BEF4]" />

      {/* Back left: a coffee roaster's newsletter. */}
      <div className="klv-float absolute top-[3%] left-[2%] w-[43cqw] -rotate-[5deg]" style={float(0.4)}>
        <EmailCard
          brand="MONSOON COFFEE"
          brandColor="#5A3A26"
          art={<CoffeeArt />}
          title="The autumn roast is here"
          lines={["Jaggery, cocoa and a little", "smoke. First bags ship Friday."]}
          button={{ label: "Shop the roast", bg: "#5A3A26" }}
        />
      </div>

      {/* Back right: a yoga studio's weekly email. */}
      <div className="klv-float absolute top-[4%] right-[1%] w-[40cqw] rotate-[5deg]" style={float(1.1)}>
        <EmailCard
          brand="BLOOM YOGA"
          brandColor="#4B3A8C"
          art={<YogaArt />}
          title="Your week, a little calmer"
          lines={["Sunrise flow is back on", "Tuesdays at 6:30."]}
          button={{ label: "Book a class", bg: "#5B47B0" }}
        />
      </div>

      {/* Front: the chai shop's Diwali offer, written with AI. */}
      <div className="klv-float absolute top-[38%] left-[27%] w-[45cqw]" style={float(0)}>
        <EmailCard
          brand="CHAI CORNER"
          brandColor="#9A3412"
          art={<ChaiArt />}
          title="Diwali delight: 20% off masala chai"
          lines={["Hi Meera, light up the festival", "with our best chai. This week only."]}
          button={{ label: "Order now", bg: "#C2410C" }}
          featured
        />
      </div>

      {/* Bottom left, on the lilac block: this email was drafted by AI. */}
      <div
        className="klv-float absolute bottom-[12%] left-[1%] flex w-[25cqw] items-start gap-[1.4cqw] rounded-[2cqw] border border-zinc-200 bg-white p-[2.2cqw] shadow-[0_10px_24px_-12px_rgb(16_32_27/0.35)]"
        style={float(1.6)}
      >
        <Glyph icon={SparklesIcon} className="mt-[0.2cqw] size-[3.2cqw]" />
        <p className="text-[2.1cqw] leading-[1.35] text-zinc-600">
          <span className="font-semibold text-zinc-900">Drafted by AI</span> from one sentence, in 4 seconds
        </p>
      </div>

      {/* Bottom right: how the chai email did. */}
      <div
        className="klv-float absolute right-[2%] bottom-[9%] w-[28cqw] rounded-[2.4cqw] border border-zinc-200 bg-white p-[2.6cqw] shadow-[0_14px_30px_-14px_rgb(16_32_27/0.35)]"
        style={float(0.8)}
      >
        <div className="flex items-center justify-between text-[2cqw] text-zinc-500">
          <span>Opened</span>
          <span className="inline-flex items-center gap-[0.6cqw] font-semibold text-emerald-700">
            <TrendingUpIcon className="size-[2.4cqw]" />
            +8%
          </span>
        </div>
        <p className="mt-[0.6cqw] text-[5.4cqw] leading-none font-semibold tracking-tight text-zinc-950">46%</p>
        <div className="mt-[2cqw] flex h-[6cqw] items-end gap-[0.9cqw]">
          {[34, 42, 38, 55, 61, 58, 72, 80, 76, 92].map((h, i) => (
            <span
              key={i}
              className={i >= 8 ? "flex-1 rounded-[0.5cqw] bg-emerald-600" : "flex-1 rounded-[0.5cqw] bg-emerald-200"}
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** One small email: brand header, picture, title, two lines, button. */
function EmailCard({
  brand,
  brandColor,
  art,
  title,
  lines,
  button,
  featured = false,
}: {
  brand: string;
  brandColor: string;
  art: ReactNode;
  title: string;
  lines: [string, string];
  button: { label: string; bg: string };
  featured?: boolean;
}) {
  return (
    <div
      className={
        featured
          ? "overflow-hidden rounded-[2.6cqw] border border-zinc-200 bg-white shadow-[0_30px_60px_-28px_rgb(16_32_27/0.45),0_2px_6px_rgb(16_32_27/0.06)]"
          : "overflow-hidden rounded-[2.6cqw] border border-zinc-200 bg-white shadow-[0_18px_40px_-24px_rgb(16_32_27/0.35)]"
      }
    >
      <div className="flex items-center justify-between px-[3cqw] py-[2cqw]">
        <span className="text-[1.9cqw] font-bold tracking-[0.18em]" style={{ color: brandColor }}>
          {brand}
        </span>
        <span className="text-[1.6cqw] text-zinc-400">View online</span>
      </div>
      <div className="aspect-[2/1] w-full">{art}</div>
      <div className="px-[3cqw] pt-[2.6cqw] pb-[3cqw]">
        <p className="text-[3.1cqw] leading-[1.15] font-semibold tracking-tight text-zinc-950">{title}</p>
        <p className="mt-[1.4cqw] text-[1.95cqw] leading-[1.45] text-zinc-500">
          {lines[0]}
          <br />
          {lines[1]}
        </p>
        <span
          className="mt-[2.4cqw] inline-block rounded-[1.2cqw] px-[2.6cqw] py-[1.3cqw] text-[1.9cqw] font-semibold text-white"
          style={{ backgroundColor: button.bg }}
        >
          {button.label}
        </span>
      </div>
    </div>
  );
}

/* ── Little flat illustrations (simple SVG shapes, brand colours) ─────────── */

function ChaiArt() {
  return (
    <svg viewBox="0 0 200 100" className="size-full" preserveAspectRatio="xMidYMid slice">
      <rect width="200" height="100" fill="#FDE7C2" />
      {/* Festive dots */}
      {[18, 42, 158, 182].map((x, i) => (
        <circle key={x} cx={x} cy={i % 2 ? 22 : 30} r="3.2" fill="#F59E0B" opacity="0.7" />
      ))}
      <circle cx="30" cy="74" r="2.4" fill="#C2410C" opacity="0.5" />
      <circle cx="170" cy="70" r="2.4" fill="#C2410C" opacity="0.5" />
      {/* Saucer */}
      <ellipse cx="100" cy="86" rx="44" ry="7" fill="#9A3412" opacity="0.18" />
      {/* Cup */}
      <path d="M70 44h56l-5 36a8 8 0 0 1-8 7H83a8 8 0 0 1-8-7z" fill="#C2410C" />
      <path d="M126 52h6a10 10 0 0 1 0 20h-8" fill="none" stroke="#C2410C" strokeWidth="5" />
      <path d="M72 51h52" stroke="#FDBA74" strokeWidth="3" />
      {/* Steam */}
      <path d="M88 36c-5-6 5-9 0-16M100 36c-5-6 5-9 0-16M112 36c-5-6 5-9 0-16" fill="none" stroke="#9A3412" strokeWidth="2.4" strokeLinecap="round" opacity="0.45" />
    </svg>
  );
}

function CoffeeArt() {
  return (
    <svg viewBox="0 0 200 100" className="size-full" preserveAspectRatio="xMidYMid slice">
      <rect width="200" height="100" fill="#EFE3D3" />
      <rect x="0" y="62" width="200" height="38" fill="#E2D0B8" />
      {/* Coffee bag */}
      <path d="M78 22h44l6 66H72z" fill="#5A3A26" />
      <path d="M78 22h44v8H78z" fill="#7A5038" />
      <rect x="86" y="46" width="28" height="18" rx="2" fill="#F5EBDD" />
      <ellipse cx="100" cy="55" rx="5" ry="3.4" fill="#5A3A26" />
      {/* Beans */}
      {[
        [44, 74],
        [56, 82],
        [148, 76],
        [160, 84],
        [140, 88],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`} transform={`rotate(-25 ${x} ${y})`}>
          <ellipse cx={x} cy={y} rx="6" ry="4" fill="#7A5038" />
          <path d={`M${x - 5} ${y}h10`} stroke="#3F281A" strokeWidth="1.2" />
        </g>
      ))}
    </svg>
  );
}

function YogaArt() {
  return (
    <svg viewBox="0 0 200 100" className="size-full" preserveAspectRatio="xMidYMid slice">
      <rect width="200" height="100" fill="#ECE7FC" />
      <circle cx="140" cy="40" r="20" fill="#F9C784" />
      <path d="M0 78c30-18 60-18 90-4s70 14 110-8v34H0z" fill="#C9BEF4" />
      <path d="M0 88c40-12 80-10 120 0s60 6 80-2v14H0z" fill="#9C8BE0" />
    </svg>
  );
}
