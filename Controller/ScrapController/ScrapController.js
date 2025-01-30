// userController.js
import axios from "axios";
import * as ScrapModel from "../../Model/ScrapModel.js";
import extractJsonFromHtml from "../../_helpers/extractJsonFromHtml.js";
import findSnapshots from "../../_helpers/findSnapshots.js";
import { ApifyClient } from "apify-client";

const userController = {
  getUser: (req, res) => {
    const username = req.params.username;
    const user = ScrapModel.findUserByUsername(username);
    if (user) {
      res.json(user);
    } else {
      res.status(404).send("User not found");
    }
  },
  createUser: (req, res) => {
    const { username, email } = req.body;
    const newUser = ScrapModel.createUser(username, email);
    // Simulate saving to a database
    res.status(201).json(newUser);
  },
};
// Initialize the ApifyClient with API token
const client = new ApifyClient({
  token: "apify_api_q9EHdnh1W8ihCovKdEyCZcciZNh5Kr2a68kw",
});
// Prepare Actor input

const adTrackerController = {
  trackAd: async (req, res) => {
    const adId = req.body.adURL;
    const folderId = req.body.folderId;
    const userId = req.body.user_id;
    // console.log(adId, folderId, userId);
    const input = {
      urls: [
        {
          url: adId,
        },
      ],
      count: 200,
      "scrapePageAds.activeStatus": "all",
      period: "",
    };
    // const response = await axios(adId);
    // const jsonData = extractJsonFromHtml(response?.data);

    // jsonData.forEach((json) => {
    //   const snapshots = findSnapshots(json);
    //   allSnapshots = allSnapshots.concat(snapshots);
    // });
    // const length = allSnapshots.length;
    // console.log(length);

    (async () => {
      // Run the Actor and wait for it to finish
      let allSnapshots = [];
      const run = await client.actor("XtaWFhbtfxyzqrFmd").call(input);
      // Fetch and print Actor results from the run's dataset (if any)
      console.log("Results from dataset");
      const { items } = await client.dataset(run.defaultDatasetId).listItems();
      items.forEach((item) => {
        allSnapshots = allSnapshots.concat(item);
      });
      res.status(200).send(allSnapshots);
    })();
  },
};

export { userController, adTrackerController };
