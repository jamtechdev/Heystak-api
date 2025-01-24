import * as cheerio from "cheerio";

function extractJsonFromHtml(html) {
  const $ = cheerio.load(html);
  const scriptTags = $('script[type="application/json"]');
  let jsonObjects = [];

  scriptTags.each((i, elem) => {
    const scriptContent = $(elem).html();
    try {
      const jsonData = JSON.parse(scriptContent);
   
      jsonObjects.push(jsonData);
    } catch (error) {
      console.error("Error parsing JSON:", error);
    }
  });

  return jsonObjects;
}

export default extractJsonFromHtml;
