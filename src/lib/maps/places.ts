import type { Coordinates } from "@/types/domain";
import { googleMapsRequest } from "@/lib/maps/telemetry";

export type PlaceSuggestion = {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
};

export type PlaceDetails = {
  address: string;
  coordinates: Coordinates;
};

function mapsKey() {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("Address search is not configured");
  return key;
}

export async function searchPlaces(input: string, sessionToken?: string): Promise<PlaceSuggestion[]> {
  const response = await googleMapsRequest("places_autocomplete", "https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": mapsKey(),
      "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat"
    },
    body: JSON.stringify({
      input,
      includedRegionCodes: ["ng"],
      languageCode: "en",
      regionCode: "NG",
      sessionToken,
      locationBias: {
        circle: {
          center: { latitude: 7.3775, longitude: 3.947 },
          radius: 50000
        }
      }
    }),
    cache: "no-store"
  });
  if (!response.ok) throw new Error("Address search is temporarily unavailable");
  const body = await response.json() as {
    suggestions?: Array<{
      placePrediction?: {
        placeId?: string;
        text?: { text?: string };
        structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
      };
    }>;
  };
  return (body.suggestions ?? []).flatMap(({ placePrediction }) => {
    if (!placePrediction?.placeId || !placePrediction.text?.text) return [];
    return [{
      placeId: placePrediction.placeId,
      description: placePrediction.text.text,
      mainText: placePrediction.structuredFormat?.mainText?.text ?? placePrediction.text.text,
      secondaryText: placePrediction.structuredFormat?.secondaryText?.text ?? ""
    }];
  });
}

export async function getPlaceDetails(placeId: string, sessionToken?: string): Promise<PlaceDetails> {
  const parameters = new URLSearchParams({ languageCode: "en", regionCode: "NG" });
  if (sessionToken) parameters.set("sessionToken", sessionToken);
  const response = await googleMapsRequest("place_details", `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?${parameters}`, {
    headers: {
      "X-Goog-Api-Key": mapsKey(),
      "X-Goog-FieldMask": "formattedAddress,location"
    },
    cache: "no-store"
  });
  if (!response.ok) throw new Error("That address could not be confirmed");
  const body = await response.json() as {
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
  };
  if (!body.formattedAddress || !Number.isFinite(body.location?.latitude) || !Number.isFinite(body.location?.longitude)) {
    throw new Error("That address could not be confirmed");
  }
  return {
    address: body.formattedAddress,
    coordinates: {
      latitude: body.location!.latitude!,
      longitude: body.location!.longitude!
    }
  };
}
