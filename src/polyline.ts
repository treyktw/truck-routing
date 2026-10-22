export type RoutePoint = {
  latitude: number;
  longitude: number;
};

const HERE_DECODING_TABLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function decodeSigned(value: number) {
  return (value & 1) === 1 ? ~(value >> 1) : value >> 1;
}

function decodeHereUnsignedValue(encoded: string, indexRef: { index: number }) {
  let result = 0;
  let shift = 0;

  while (indexRef.index < encoded.length) {
    const value = HERE_DECODING_TABLE.indexOf(encoded[indexRef.index++] ?? "");
    if (value < 0) {
      throw new Error("Invalid HERE flexible polyline character");
    }

    result |= (value & 0x1f) << shift;
    if ((value & 0x20) === 0) {
      return result;
    }
    shift += 5;
  }

  throw new Error("Invalid HERE flexible polyline termination");
}

export function decodeHereFlexiblePolyline(encoded: string): RoutePoint[] {
  const indexRef = { index: 0 };
  const version = decodeHereUnsignedValue(encoded, indexRef);
  if (version !== 1) {
    throw new Error(`Unsupported HERE flexible polyline version: ${version}`);
  }

  const header = decodeHereUnsignedValue(encoded, indexRef);
  const precision = header & 0x0f;
  const thirdDimension = (header >> 4) & 0x07;
  const multiplier = 10 ** precision;

  let lat = 0;
  let lng = 0;
  const points: RoutePoint[] = [];

  while (indexRef.index < encoded.length) {
    lat += decodeSigned(decodeHereUnsignedValue(encoded, indexRef));
    lng += decodeSigned(decodeHereUnsignedValue(encoded, indexRef));
    if (thirdDimension !== 0) {
      decodeHereUnsignedValue(encoded, indexRef);
    }

    points.push({
      latitude: lat / multiplier,
      longitude: lng / multiplier,
    });
  }

  return points;
}

export function decodeHereFlexiblePolylines(polylines: string[]) {
  return polylines.flatMap((polyline) => decodeHereFlexiblePolyline(polyline));
}

export function decodeGooglePolyline(encoded: string): RoutePoint[] {
  let index = 0;
  let lat = 0;
  let lng = 0;
  const points: RoutePoint[] = [];

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += decodeSigned(result);

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += decodeSigned(result);

    points.push({
      latitude: lat / 1e5,
      longitude: lng / 1e5,
    });
  }

  return points;
}
