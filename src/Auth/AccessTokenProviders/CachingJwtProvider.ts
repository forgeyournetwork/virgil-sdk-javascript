import {
	IAccessToken,
	IAccessTokenProvider,
	ITokenContext,
} from "./interfaces";
import { GetJwtCallback, Jwt } from "../Jwt";
import { addSeconds } from "../../Lib/timestamp";

const TOKEN_EXPIRATION_MARGIN = 5;

/**
 * Implementation of {@link IAccessTokenProvider} that caches the JWT
 * in memory while it's fresh (i.e. not expired) and uses the user-provided
 * callback function to get the JWT when requested by the clients.
 */
export class CachingJwtProvider implements IAccessTokenProvider {
	private cachedJwt?: Jwt;
	private readonly getJwt: (tokenContext: ITokenContext) => Promise<Jwt>;
	private jwtPromise?: Promise<Jwt>;

	/**
	 * Creates a new instance of `CachingJwtProvider`.
	 * @param {GetJwtCallback} renewJwtFn - The function that will be called
	 * whenever the fresh JWT is needed. If the `renewJwtFn` returns the JWT
	 * as a string, it will be converted to {@link Jwt} instance automatically.
	 * @param {Jwt|string} [initialToken] - Optional initial JWT.
	 */
	constructor(renewJwtFn: GetJwtCallback, initialToken?: Jwt | string) {
		if (typeof renewJwtFn !== "function") {
			throw new TypeError("`renewJwtFn` must be a function");
		}

		if (initialToken) {
			let jwt;
			if (typeof initialToken === "string") {
				jwt = Jwt.fromString(initialToken);
			} else if (initialToken instanceof Jwt) {
				jwt = initialToken;
			} else {
				throw new Error(
					`Expected "initialToken" to be a string or an instance of Jwt, got ${typeof initialToken}`
				);
			}

			this.cachedJwt = jwt;
		}

		this.getJwt = (context: ITokenContext) => {
			if (
				this.cachedJwt &&
				!this.cachedJwt.isExpired(
					addSeconds(new Date(), TOKEN_EXPIRATION_MARGIN)
				)
			) {
				return Promise.resolve(this.cachedJwt);
			}

			if (this.jwtPromise) {
				return this.jwtPromise;
			}

			this.jwtPromise = Promise.resolve(renewJwtFn(context))
				.then((token) => {
					const jwt =
						typeof token === "string"
							? Jwt.fromString(token)
							: token;
					this.cachedJwt = jwt;
					this.jwtPromise = undefined;
					return jwt;
				})
				.catch((err) => {
					if (typeof err === "string") {
						try {
							const jwt = Jwt.fromString(err);
							this.cachedJwt = jwt;
							this.jwtPromise = undefined;
							return jwt;
						} catch (error) {
							console.error(error);
						}
					}
					this.jwtPromise = undefined;
					throw err;
				});

			return this.jwtPromise;
		};
	}

	/**
	 * Returns a `Promise` resolved with the cached token if it's fresh, or the
	 * token obtained by the call to the `renewJwtCallback` otherwise. The token
	 * obtained from the `renewJwtCallback` is then cached. If the `renewJwtCallback`
	 * returns the JWT as a string, it is converted to {@link Jwt} instance before returning.
	 * @param {ITokenContext} context
	 * @returns {Promise<IAccessToken>}
	 */
	getToken(context: ITokenContext): Promise<IAccessToken> {
		return this.getJwt(context);
	}
}
