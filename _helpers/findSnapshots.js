function findSnapshots(obj) {
  let snapshots = [];
  if (typeof obj === "object" && obj !== null) {
    for (const key in obj) {
      if (key === "collated_results" && typeof obj[key] === "object") {
        snapshots.push(obj[key]);
      } else if (typeof obj[key] === "object") {
        snapshots = snapshots.concat(findSnapshots(obj[key]));
      }
    }
  }
  return snapshots;
}

export default findSnapshots
