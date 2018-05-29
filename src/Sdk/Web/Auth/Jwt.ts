import { IExtraData } from '../../ICard';
import { base64UrlDecode, base64UrlEncode } from '../../Lib/base64';
import { IAccessToken } from './AccessTokenProviders';
import { getUnixTimestamp } from '../../Lib/timestamp';

export const SubjectPrefix = "identity-";
export const IssuerPrefix = "virgil-";

/**
 * Content type of the token. Used to convey structural information
 * about the JWT.
 *
 * @type {string}
 *
 * @hidden
 */
export const VirgilContentType = "virgil-jwt;v=1";

/**
 * Media type of the JWT.
 *
 * @type {string}
 *
 * @hidden
 */
export const JwtContentType = "JWT";

/**
 * Interface for objects representing JWT Header.
 */
export interface IJwtHeader {
	/**
	 * The algorithm used to calculate the token signature.
	 */
	readonly alg: string;

	/**
	 * The type of the token. Always "JWT".
	 */
	readonly typ: string;

	/**
	 * The content type of the token.
	 */
	readonly cty: string;

	/**
	 * Id of the API Key used to calculate the token signature.
	 */
	readonly kid: string;
}

/**
 * Interface for objects representing JWT Body.
 */
export interface IJwtBody {
	/**
	 * The issuer of the token (i.e. Application ID)
	 */
	readonly iss: string;

	/**
	 * The subject of the token (i.e. User identity)
	 */
	readonly sub: string;

	/**
	 * The token issue date as Unix timestamp
	 */
	readonly iat: number;

	/**
	 * The token expiry date as Unix timestamp
	 */
	readonly exp: number;

	/**
	 * User-defined attributes associated with the token
	 */
	readonly ada?: IExtraData;
}

/**
 * Class representing the JWT providing access to the
 * Virgil Security APIs.
 * Implements {@link IAccessToken} interface.
 */
export class Jwt implements IAccessToken {

	/**
	 * Parses the string representation of the JWT into
	 * an object representation.
	 *
	 * @param {string} jwtStr - The JWT string. Must have the following format:
	 *
	 * `base64UrlEncode(Header) + "." + base64UrlEncode(Body) + "." + base64UrlEncode(Signature)`
	 *
	 * See the {@link https://jwt.io/introduction/ | Introduction to JWT} for more details.
	 *
	 * @returns {Jwt}
	 */
	public static fromString (jwtStr: string): Jwt {
		const parts = jwtStr.split('.');

		if (parts.length !== 3) throw new Error('Wrong JWT format');

		try {
			const headerJson = base64UrlDecode(parts[0]).toString('utf8');
			const bodyJson   = base64UrlDecode(parts[1]).toString('utf8');
			const signature  = base64UrlDecode(parts[2]);

			const header = JSON.parse(headerJson);
			const body   = JSON.parse(bodyJson);

			return new Jwt(header, body, signature);
		} catch (e) {
			throw new Error('Wrong JWT format');
		}
	}

	/**
	 * The data used to calculate the JWT Signature
	 *
	 * `base64UrlEncode(header) + "." + base64UrlEncode(body)`
	 */
	public readonly unsignedData: Buffer;
	private readonly stringRepresentation: string;

	/**
	 * Creates a new instance of `Jwt` with the given header, body and
	 * optional signature.
	 *
	 * @param {IJwtHeader} header
	 * @param {IJwtBody} body
	 * @param {Buffer} signature
	 */
	constructor (
		public readonly header: IJwtHeader,
		public readonly body  : IJwtBody,
		public readonly signature?: Buffer
	) {
		const withoutSignature = this.headerBase64() + '.' + this.bodyBase64();

		this.unsignedData = Buffer.from(withoutSignature, 'utf8');

		if (this.signature == null) {
			this.stringRepresentation = withoutSignature;
		} else {
			this.stringRepresentation = withoutSignature + '.' + this.signatureBase64();
		}
	}

	/**
	 * Returns the string representation of this JWT.
	 * @returns {string}
	 */
	public toString () : string {
		return this.stringRepresentation;
	}

	/**
	 * Retrieves the identity that is the subject of this JWT.
	 * @returns {string}
	 */
	public identity(): string {
		if (this.body.sub.indexOf(SubjectPrefix) !== 0) {
			throw new Error('wrong sub format');
		}

		return this.body.sub.substr(SubjectPrefix.length);
	}

	/**
	 * Retrieves the application ID that is the issuer of this JWT.
	 * @returns {string}
	 */
	public appId(): string {
		if (this.body.iss.indexOf(IssuerPrefix) !== 0) {
			throw new Error('wrong iss format');
		}

		return this.body.iss.substr(IssuerPrefix.length);
	}

	/**
	 * Returns a boolean indicating whether this JWT is (or will be)
	 * expired at the given date or not.
	 *
	 * @param {Date} at - The date to check. Defaults to `new Date()`.
	 * @returns {boolean} - `true` if token is expired, otherwise `false`.
	 */
	public isExpired (at: Date = new Date): boolean {
		const now = getUnixTimestamp(at);
		return this.body.exp < now;
	}

	private headerBase64(): string {
		return base64UrlEncode( JSON.stringify(this.header) );
	}

	private bodyBase64(): string {
		return base64UrlEncode( JSON.stringify(this.body) );
	}

	private signatureBase64(): string {
		return base64UrlEncode( this.signature! );
	}
}