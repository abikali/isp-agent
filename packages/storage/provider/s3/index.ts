import {
	DeleteObjectsCommand,
	GetObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl as getS3SignedUrl } from "@aws-sdk/s3-request-presigner";
import { logger } from "@repo/logs";
import type {
	GetSignedUploadUrlHandler,
	GetSignedUrlHander,
} from "../../types";

let s3Client: S3Client | null = null;

const getS3Client = () => {
	if (s3Client) {
		return s3Client;
	}

	const s3Endpoint = process.env["S3_ENDPOINT"];
	if (!s3Endpoint) {
		throw new Error("Missing env variable S3_ENDPOINT");
	}

	const s3Region = process.env["S3_REGION"] || "auto";

	const s3AccessKeyId = process.env["S3_ACCESS_KEY_ID"];
	if (!s3AccessKeyId) {
		throw new Error("Missing env variable S3_ACCESS_KEY_ID");
	}

	const s3SecretAccessKey = process.env["S3_SECRET_ACCESS_KEY"];
	if (!s3SecretAccessKey) {
		throw new Error("Missing env variable S3_SECRET_ACCESS_KEY");
	}

	s3Client = new S3Client({
		region: s3Region,
		endpoint: s3Endpoint,
		forcePathStyle: false,
		credentials: {
			accessKeyId: s3AccessKeyId,
			secretAccessKey: s3SecretAccessKey,
		},
	});

	return s3Client;
};

export const getSignedUploadUrl: GetSignedUploadUrlHandler = async (
	path,
	{ bucket, contentType = "image/jpeg" },
) => {
	const s3Client = getS3Client();
	try {
		return await getS3SignedUrl(
			s3Client,
			new PutObjectCommand({
				Bucket: bucket,
				Key: path,
				ContentType: contentType,
			}),
			{
				expiresIn: 60,
			},
		);
	} catch (e) {
		logger.error(e);

		throw new Error("Could not get signed upload url");
	}
};

export const getSignedUrl: GetSignedUrlHander = async (
	path,
	{ bucket, expiresIn },
) => {
	const s3Client = getS3Client();
	try {
		return getS3SignedUrl(
			s3Client,
			new GetObjectCommand({ Bucket: bucket, Key: path }),
			expiresIn !== undefined ? { expiresIn } : {},
		);
	} catch (e) {
		logger.error(e);
		throw new Error("Could not get signed url");
	}
};

/**
 * List all objects with a given prefix in a bucket
 */
export async function listObjects(
	prefix: string,
	bucket: string,
): Promise<string[]> {
	const s3Client = getS3Client();
	try {
		const response = await s3Client.send(
			new ListObjectsV2Command({
				Bucket: bucket,
				Prefix: prefix,
			}),
		);
		return (response.Contents || [])
			.map((obj) => obj.Key)
			.filter((key): key is string => key !== undefined);
	} catch (e) {
		logger.error(e);
		throw new Error("Could not list objects");
	}
}

/**
 * Delete multiple objects from a bucket
 */
export async function deleteObjects(
	keys: string[],
	bucket: string,
): Promise<void> {
	if (keys.length === 0) {
		return;
	}

	const s3Client = getS3Client();
	try {
		await s3Client.send(
			new DeleteObjectsCommand({
				Bucket: bucket,
				Delete: {
					Objects: keys.map((key) => ({ Key: key })),
				},
			}),
		);
	} catch (e) {
		logger.error(e);
		throw new Error("Could not delete objects");
	}
}
