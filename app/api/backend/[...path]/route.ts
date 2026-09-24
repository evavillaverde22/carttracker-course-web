import {
  NextRequest,
  NextResponse,
} from "next/server";

import { auth0 } from "@/lib/auth0";

const API_BASE_URL =
  "https://08m2whbesa.execute-api.us-east-1.amazonaws.com";

function isAllowedRoute(
  method: string,
  path: string
) {
  if (
    method === "GET" &&
    /^devices\/[^/]+$/.test(path)
  ) {
    return true;
  }

  if (
    method === "GET" &&
    path === "sims/available"
  ) {
    return true;
  }

  if (
    method === "GET" &&
    path === "courses"
  ) {
    return true;
  }

  if (
    method === "GET" &&
    /^courses\/[^/]+\/carts$/.test(path)
  ) {
    return true;
  }

  if (
    method === "POST" &&
    /^devices\/[^/]+\/assign$/.test(path)
  ) {
    return true;
  }

  return false;
}

async function handleRequest(
  request: NextRequest,
  context: {
    params: Promise<{
      path: string[];
    }>;
  }
) {
  try {
    const session =
      await auth0.getSession();

    if (!session) {
      return NextResponse.json(
        {
          message: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    const tokenResult =
      await auth0.getAccessToken();

    const accessToken =
      tokenResult.token;

    if (!accessToken) {
      return NextResponse.json(
        {
          message:
            "Access token unavailable",
        },
        {
          status: 401,
        }
      );
    }

    const { path } =
      await context.params;

    const backendPath =
      path.join("/");

    if (
      !isAllowedRoute(
        request.method,
        backendPath
      )
    ) {
      return NextResponse.json(
        {
          message: "Route not allowed",
        },
        {
          status: 403,
        }
      );
    }

    const incomingUrl =
      new URL(request.url);

    const query =
      incomingUrl.searchParams.toString();

    const awsUrl =
      `${API_BASE_URL}/${backendPath}` +
      `${query ? `?${query}` : ""}`;

    const headers:
      Record<string, string> = {
        Authorization:
          `Bearer ${accessToken}`,
      };

    const contentType =
      request.headers.get(
        "content-type"
      );

    if (contentType) {
      headers["Content-Type"] =
        contentType;
    }

    const body =
      request.method === "GET"
        ? undefined
        : await request.text();

    const response =
      await fetch(
        awsUrl,
        {
          method:
            request.method,
          headers,
          body,
          cache: "no-store",
        }
      );

    const responseBody =
      await response.text();

    return new NextResponse(
      responseBody,
      {
        status:
          response.status,
        headers: {
          "content-type":
            response.headers.get(
              "content-type"
            ) ??
            "application/json",
        },
      }
    );
  } catch (error) {
    console.error(
      "Backend proxy failed:",
      error
    );

    return NextResponse.json(
      {
        message:
          "Backend request failed",
      },
      {
        status: 500,
      }
    );
  }
}

export const GET =
  handleRequest;

export const POST =
  handleRequest;
