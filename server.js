const express = require("express");
const { FACEBOOK_ADS_URL } = require("./constant/constant");

const app = express();
const cors = require("cors");
const dotenv = require("dotenv");
dotenv.config();
// var corsOptions = {
//   origin: process.env.BASE_PORT,
//   optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
// };

app.use(cors());

// const PORT = 8080;

app.get("/proxy/facebook", async (req, res) => {
  const fetch = await import("node-fetch").then((mod) => mod.default);
  const libraryId = req.query.id; // Default value if no ID is provided
  try {
    const response = await fetch(`${FACEBOOK_ADS_URL}/?id=${libraryId}`);
    const data = await response.text();
    const regex = /"isActive":\s*(true|false|null)/;
    const match = data.match(regex);
    res.json({ isActive: match ? match[1] : null });
  } catch (error) {
    res.status(500).send("Error fetching data from Facebook");
  }
});

app.listen(process.env.BASE_PORT || 8090, () => {
  console.log(
    `Proxy server running at http://localhost:${process.env.BASE_PORT}`
  );
});
