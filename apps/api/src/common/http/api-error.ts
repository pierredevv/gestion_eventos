/**
 * Shape of every error response returned by the API.
 * The web app mirrors this type through the generated OpenAPI contract.
 */
export interface ApiErrorShape {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
  requestId?: string;
}
