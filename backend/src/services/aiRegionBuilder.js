import axios from "axios";

export async function buildRegionsWithAI(destination, rawPlaces) {
  const res = await axios.post("http://localhost:9000/build-regions", {
    destination,
    places: rawPlaces,
  });

  return JSON.parse(res.data);
}
