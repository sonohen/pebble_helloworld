import Poco from "commodetto/Poco";
import parseBMF from "commodetto/parseBMF";
import parseRLE from "commodetto/parseRLE";

const render = new Poco(screen);

// Fonts
// const timeFont = new render.Font("Bitham-Bold", 42);
// const dateFont = new render.Font("Gothic-Bold", 24);
const timeFont = getFont("Jersey10-Regular", 56);
const dateFont = getFont("Jersey10-Regular", 24);

// Colors
const black = render.makeColor(0, 0, 0);
const white = render.makeColor(255, 255, 255);

// Precompute layout positions
/*
 * (0,0) ------------------------ x
 * |                                                 |
 * |     Time                   | block.height       | render.height
 * |     Date                   |                    |
 * |                                                 |
 * y
 *
 */
const blockHeight = timeFont.height + dateFont.height;
const timeY = (render.height - blockHeight) / 2;
const dateY = timeY + timeFont.height;

// Day and month names for date formatting
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function draw(event) {
  const now = event.date;

  render.begin();
  render.fillRectangle(black, 0, 0, render.width, render.height);

  // Format time as HH:MM
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const timeStr = `${hours}:${minutes}`;

  // Center the time vertically (shifted up slightly to make room for date)
  let width = render.getTextWidth(timeStr, timeFont);
  render.drawText(timeStr, timeFont, white, (render.width - width) / 2, timeY);

  // Format date as "Mon Jan 01"
  const dayName = DAYS[now.getDay()];
  const monthName = MONTHS[now.getMonth()];
  const dateStr = `${dayName} ${monthName} ${String(now.getDate()).padStart(2, "0")}`;

  // Draw date below the time
  width = render.getTextWidth(dateStr, dateFont);
  render.drawText(dateStr, dateFont, white, (render.width - width) / 2, dateY);

  render.end();
}

function getFont(name, size) {
  // Toolchain generates a .fnt file for the font and a .bm4 file for the alpha channel. The .bm4 file is RLE compressed, so we need to parse it separately.
  // "alpha" defines in the manifest.json file that the .bm4 file is an alpha channel for the font, so we can use it to render the font with transparency.
  const font = parseBMF(new Resource(`${name}-${size}.fnt`));
  font.bitmap = parseRLE(new Resource(`${name}-${size}-alpha.bm4`));
  return font;
}

// Update every minute (fires immediately when registered)
watch.addEventListener("minutechange", draw);
