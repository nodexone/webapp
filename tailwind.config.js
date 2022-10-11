module.exports = {
  content: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
  darkMode: "media", // or 'class'
  theme: {
    colors: {
      white: "#fff",
      "text-main": "#082D63",
      "light-grey": "#f7f9fc",
      grey: "#ebeff5",
      "light-blue": "#8396B1",
      "medium-blue": "#5e7699",
      "dark-blue": "#082d63",
      "light-electric": "#2868e1",
      "medium-electric": "#245dc7",
      "dark-electric": "#1f51ad",
      "light-red": "#e42929",
      "medium-red": "#c92424",
      "dark-red": "#b02020",
      "light-green": "#50e3a5",
      "medium-green": "#47c993",
      "dark-green": "#1ab171",
      "light-yellow": "#ffd782",
      "medium-yellow": "#ffc74f",
      "dark-yellow": "#ffb922",
      orange: "#ff562e",
      dark: "#082D63",
    },

    fontSize: {
      10: ["10px", "14px"],
      12: ["12px", "17px"],
      14: ["14px", "20px"],
      16: ["16px", "23px"],
      18: ["18px", "26px"],
      20: ["20px", "29px"],
      28: ["28px", "46px"],
      32: ["32px", "46px"],
      40: ["40px", "58px"],
      48: ["48px", "70px"],
    },

    extend: {},
  },
  variants: {
    extend: {},
  },
  plugins: [],
};
