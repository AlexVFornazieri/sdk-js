import axios, { AxiosError, AxiosResponse } from "axios";

import Account from "../Resources/AccountDeprecated";
import Resources from "../Resources/Resources";
import { DownlinkOptions } from "./utils.types";

/**
 * Handles the message presented to the user when API response 4xx or 5xx
 * @param {AxiosError} error error object from Axios
 */
async function handleDownlinkError(error: AxiosError): Promise<AxiosResponse<any, any>> {
  if (typeof error.response?.data === "string" && error.response?.data.includes("Authorization is missing")) {
    throw "Additional parameter is missing with in the TagoIO Authorization used for this device";
  }
  throw `Downlink failed with status ${error.response.status}: ${JSON.stringify(error.response.data)}`;
}

/**
 * Perform downlink to a device using official TagoIO support.
 * Example
 * - sendDownlink(account, "736acc665bd2460018df8c52", { payload: "01", port: 05, confirmed: false })
 * @param {Class} account TagoIO SDK Account instanced class
 * @param {String} device_id id of your device
 * @param {Object} dn_options downlink parameter options.
 * @param {String} dn_options.payload hexadecimal payload to be sent to the device.
 * @param {Number} [dn_options.port] port to be used for the downlink. Default is 1.
 * @param {Boolean} [dn_options.confirmed] confirmed status, default is false.
 * @requires Device Token Access permission for the Analysis
 * @requires Device Info Access permission for the Analysis
 * @requires Device Configuration Parameters Access permission for the Analysis
 * @requires Network Access permission for the Analysis
 * @returns
 */
async function sendDownlink(resource: Account | Resources, device_id: string, dn_options: DownlinkOptions) {
  if (!(resource instanceof Account) && !(resource instanceof Resources)) {
    throw "The parameter 'resource' must be an instance of a TagoIO Resource.";
  }

  // Find the token containing the authorization code used.
  const device_tokens = await resource.devices.tokenList(device_id, {
    page: 1,
    fields: ["name", "serie_number", "last_authorization"],
    amount: 10,
  });

  const token = device_tokens.find((x) => x.serie_number && x.last_authorization);
  if (!token) {
    throw "Can't perform the downlink. Wait for at least 1 uplink from the NS to use this operation.";
  }

  // Get the connector ID from the device
  const { network: network_id } = await resource.devices.info(device_id);
  if (!network_id) {
    throw "Device is not using a network.";
  }

  // Get the network information with the NS URL for the Downlink
  const network = await resource.integration.networks.info(network_id, ["id", "middleware_endpoint", "name"]);
  if (!network.middleware_endpoint) {
    throw "This device network doesn't support downlinks.";
  }

  // Set the parameters for the device. Some NS like Everynet need this.
  const params = await resource.devices.paramList(device_id);
  let downlink_param = params.find((x) => x.key === "downlink");
  downlink_param = {
    id: downlink_param ? downlink_param.id : null,
    key: "downlink",
    value: String(dn_options.payload),
    sent: false,
  };
  await resource.devices.paramSet(device_id, downlink_param);

  const data = {
    device: token.serie_number,
    authorization: token.last_authorization,
    payload: dn_options.payload,
    port: dn_options.port,
    confirmed: dn_options.confirmed,
  };

  const result = await axios.post(`https://${network.middleware_endpoint}/downlink`, data).catch(handleDownlinkError);

  return `Downlink accepted with status ${result.status}`;
}

export default sendDownlink;
export { handleDownlinkError };
