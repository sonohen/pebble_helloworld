import Poco from "commodetto/Poco";
import parseBMF from "commodetto/parseBMF";
import parseRLE from "commodetto/parseRLE";
import Battery from "embedded:sensor/Battery";
import Location from "embedded:sensor/Location";
import Message from "pebble/message";

const render = new Poco(screen);

let weather = null;
let location = null;

// Default Configuration
const DEFAULT_SETTINGS = {
  backgroundColor: { r: 0, g: 0, b: 0 },
  textColor: { r: 255, g: 255, b: 255 },
  useFahrenheit: true,
  showDate: true,
  use24Hour: false,
};

let settings = loadSettings();

let bgColor = render.makeColor(
  settings.backgroundColor.r,
  settings.backgroundColor.g,
  settings.backgroundColor.b,
);

let textColor = render.makeColor(
  settings.textColor.r,
  settings.textColor.g,
  settings.textColor.b,
);

// Fonts
// const timeFont = new render.Font("Bitham-Bold", 42);
// const dateFont = new render.Font("Gothic-Bold", 24);
const timeFont = getFont("Jersey10-Regular", 56);
const dateFont = getFont("Jersey10-Regular", 24);
const smallFont = new render.Font("Gothic-Regular", 18);

// Colors
const green = render.makeColor(0, 170, 0);
const yellow = render.makeColor(255, 170, 0);
const red = render.makeColor(255, 0, 0);

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

let lastDate = new Date();
let batteryPercent = 100;

// Monitoring connection state
let isConnected = true;
watch.addEventListener("connected", checkConnection);
checkConnection();

// Battery
const battery = new Battery({
  onSample() {
    batteryPercent = this.sample().percent;
    drawScreen();
  },
});
batteryPercent = battery.sample().percent;

function drawScreen(event) {
  const now = event?.date ?? lastDate;
  if (event?.date) lastDate = event.date;

  render.begin();
  render.fillRectangle(bgColor, 0, 0, render.width, render.height);

  loadCachedWeather();

  // Precompute layout positions
  /*
   * (0,0) ------------------------ x
   * |    (timeY)                 |
   * |     Time                   | block.height       | render.unobstructed.height
   * |    (dateY) Date            |                    |
   * |                                                 |
   * y
   *
   */
  const blockHeight = timeFont.height + dateFont.height;
  const timeY = (render.unobstructed.height - blockHeight) / 2;
  const dateY = timeY + timeFont.height;

  // Draw battery bar at the top
  drawBatteryBar();

  // Draw disconnect indicator below battery bar
  if (!isConnected) {
    const btStr = "X";
    const btWidth = render.getTextWidth(btStr, smallFont);
    const btY = render.unobstructed.height < 180 ? 16 : 30;
    render.drawText(
      btStr,
      smallFont,
      red,
      (render.unobstructed.width - btWidth) / 2,
      btY,
    );
  }

  // Format time as HH:MM
  let hours = now.getHours();
  if (!settings.use24Hour) {
    hours = hours % 12 || 12; // Convert to 12-hour format
  }
  const hoursStr = String(hours).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  let ampm = "AM";
  if (!settings.use24Hour) {
    ampm = now.getHours() < 12 ? "AM" : "PM";
  }
  const timeStr = `${ampm} ${hoursStr}:${minutes}`;

  // Center the time vertically (shifted up slightly to make room for date)
  let width = render.getTextWidth(timeStr, timeFont);
  render.drawText(
    timeStr,
    timeFont,
    textColor,
    (render.unobstructed.width - width) / 2,
    timeY,
  );

  if (settings.showDate) {
    // Format date as "Mon Jan 01"
    const dayName = DAYS[now.getDay()];
    const monthName = MONTHS[now.getMonth()];
    const dateStr = `${dayName} ${monthName} ${String(now.getDate()).padStart(2, "0")}`;

    // Draw date below the time
    width = render.getTextWidth(dateStr, dateFont);
    render.drawText(
      dateStr,
      dateFont,
      textColor,
      (render.unobstructed.width - width) / 2,
      dateY,
    );
  }

  // Draw weather at the bottom
  drawWeather();

  render.end();
}

function getFont(name, size) {
  // Toolchain generates a .fnt file for the font and a .bm4 file for the alpha channel. The .bm4 file is RLE compressed, so we need to parse it separately.
  // "alpha" defines in the manifest.json file that the .bm4 file is an alpha channel for the font, so we can use it to render the font with transparency.
  const font = parseBMF(new Resource(`${name}-${size}.fnt`));
  font.bitmap = parseRLE(new Resource(`${name}-${size}-alpha.bm4`));
  return font;
}

function drawBatteryBar() {
  const barWidth = (render.unobstructed.width / 2) | 0;
  const barX = ((render.unobstructed.width - barWidth) / 2) | 0;
  const barY = render.unobstructed.height < 180 ? 6 : 20;
  const barHeight = 8;

  // Draw border
  render.fillRectangle(textColor, barX, barY, barWidth, barHeight);
  render.fillRectangle(
    bgColor,
    barX + 1,
    barY + 1,
    barWidth - 2,
    barHeight - 2,
  );

  // Choose color based on battery level
  let barColor;
  if (batteryPercent <= 20) {
    barColor = red;
  } else if (batteryPercent <= 50) {
    barColor = yellow;
  } else {
    barColor = green;
  }

  // Draw filled portion
  const fillWidth = ((batteryPercent * (barWidth - 4)) / 100) | 0;
  render.fillRectangle(barColor, barX + 2, barY + 2, fillWidth, barHeight - 4);
}

function drawWeather() {
  const weatherY =
    render.unobstructed.height -
    smallFont.height -
    (render.unobstructed.height < 180 ? 6 : 20);

  if (weather) {
    const unit = settings.useFahrenheit ? "°F" : "°C";
    const weatherStr = `${weather.temp}${unit} ${weather.conditions}`;
    const width = render.getTextWidth(weatherStr, smallFont);
    render.drawText(
      weatherStr,
      smallFont,
      textColor,
      (render.unobstructed.width - width) / 2,
      weatherY,
    );
  } else {
    const loadingStr = "Loading...";
    const width = render.getTextWidth(loadingStr, smallFont);
    render.drawText(
      loadingStr,
      smallFont,
      textColor,
      (render.unobstructed.width - width) / 2,
      weatherY,
    );
  }
}

function requestLocation() {
  location = new Location({
    onSample() {
      const sample = this.sample();
      console.log("Got Location: ", sample.latitude, sample.longitude);
      this.close();
      fetchWeather(sample.latitude, sample.longitude);
    },
  });
}

function getWeatherDescription(code) {
  if (code === 0) return "Clear";
  if (code <= 3) return "Cloudy";
  if (code <= 48) return "Fog";
  if (code <= 55) return "Drizzle";
  if (code <= 57) return "Fz. Drizzle";
  if (code <= 65) return "Rain";
  if (code <= 67) return "Fz. Rain";
  if (code <= 75) return "Snow";
  if (code <= 77) return "Snow Grains";
  if (code <= 82) return "Showers";
  if (code <= 86) return "Snow Shwrs";
  if (code === 95) return "T-Storm";
  if (code <= 99) return "T-Storm";
  return "Unknown";
}

async function fetchWeather(latitude, longitude) {
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    const params = {
      latitude,
      longitude,
      current: "temperature_2m,weather_code",
    };
    const unit = settings.useFahrenheit ? "F" : "C";

    if (settings.useFahrenheit) {
      params.temperature_unit = "fahrenheit";
    }

    url.search = new URLSearchParams(params);

    console.log(url);

    console.log("Fetching weather...");
    const response = await fetch(url);
    const data = await response.json();

    weather = {
      temp: Math.round(data.current.temperature_2m),
      conditions: getWeatherDescription(data.current.weather_code),
    };

    saveWeather();

    console.log("Weather: " + weather.temp + `${unit}, ` + weather.conditions);
    drawScreen();
  } catch (e) {
    console.log("Weather fetch error: " + e);
  }
}

function checkConnection() {
  isConnected = watch.connected.app;
  drawScreen();
}

function loadSettings() {
  const stored = localStorage.getItem("settings");

  if (stored) {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    } catch (e) {
      console.log("Failed to parse settings");
    }
  }

  return { ...DEFAULT_SETTINGS };
}

function saveSettings(settings) {
  localStorage.setItem("settings", JSON.stringify(settings));
}

function updateColors() {
  bgColor = render.makeColor(
    settings.backgroundColor.r,
    settings.backgroundColor.g,
    settings.backgroundColor.b,
  );

  textColor = render.makeColor(
    settings.textColor.r,
    settings.textColor.g,
    settings.textColor.b,
  );
}

function loadCachedWeather() {
  const cached = localStorage.getItem("weather");
  const cachedTime = localStorage.getItem("weatherTime");
  if (cached && cachedTime) {
    const now = Date.now();
    const age = now - parseInt(cachedTime, 10);
    if (age < 60 * 60 * 1000) {
      try {
        weather = JSON.parse(cached);
        console.log("Using cached weather");
      } catch (e) {
        console.log("Failed to parse cached weather");
      }
    }
  }
  return false;
}

function saveWeather() {
  if (weather) {
    localStorage.setItem("weather", JSON.stringify(weather));
    localStorage.setItem("weatherTime", Date.now().toString());
  }
}

const message = new Message({
  keys: [
    "BackgroundColor",
    "TextColor",
    "TemperatureUnit",
    "ShowDate",
    "HourFormat",
  ],

  onReadable() {
    const msg = this.read();

    const bg = msg.get("BackgroundColor");
    if (bg !== undefined) {
      settings.backgroundColor = {
        r: (bg >> 16) & 0xff,
        g: (bg >> 8) & 0xff,
        b: bg & 0xff,
      };
    }

    const tc = msg.get("TextColor");
    if (tc !== undefined) {
      settings.textColor = {
        r: (tc >> 16) & 0xff,
        g: (tc >> 8) & 0xff,
        b: tc & 0xff,
      };
    }

    const tu = msg.get("TemperatureUnit");
    if (tu !== undefined) {
      settings.useFahrenheit = tu === 1;
    }

    const sd = msg.get("ShowDate");
    if (sd !== undefined) {
      settings.showDate = sd === 1;
    }

    const hf = msg.get("HourFormat");
    if (hf !== undefined) {
      settings.use24Hour = hf === 1;
    }

    saveSettings();
    updateColors();
    drawScreen();

    if (tu !== undefined) {
      requestLocation();
    }
  },
});

// Update every minute (fires immediately when registered)
watch.addEventListener("minutechange", drawScreen);
watch.addEventListener("hourchange", requestLocation);
watch.addEventListener("resize", drawScreen);
