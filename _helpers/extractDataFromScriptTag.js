// This function finds the script tag and extracts the JSON
function extractDataFromScriptTag() {
    const scriptTag = document.querySelector('script[type="application/json"]');
    if (!scriptTag) {
        console.error('Script tag with type "application/json" not found.');
        return null;
    }
    try {
        return JSON.parse(scriptTag.textContent);
    } catch (e) {
        console.error('Failed to parse JSON from script tag:', e);
        return null;
    }
}

export default extractDataFromScriptTag();
