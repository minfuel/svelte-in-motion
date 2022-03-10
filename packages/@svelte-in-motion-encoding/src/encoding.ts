import * as FFmpegLibrary from "@ffmpeg/ffmpeg";

import type {IEvent} from "@svelte-in-motion/core";
import {IS_BROWSER, event} from "@svelte-in-motion/core";

import {get_codec, get_codec_arguments, get_codec_extension, ICodecNames} from "./codec";
import {get_default_codec} from "./codec";
import {get_default_crf, get_supported_crf_range} from "./crf";
import {get_supported_dimensions_range} from "./dimensions";
import {get_supported_framerate_range} from "./framerate";
import {get_pixel_format, IPixelFormatNames} from "./pixel_format";
import {get_default_pixel_format} from "./pixel_format";

const FFmpeg: typeof FFmpegLibrary = IS_BROWSER ? (globalThis as any).FFmpeg : FFmpegLibrary;

export type IEncodingEndEvent = IEvent<void>;

export type IEncodingInitializeEvent = IEvent<void>;

export type IEncodingProgressEvent = IEvent<number>;

export type IEncodingStartEvent = IEvent<void>;

export interface IEncodingHandle {
    EVENT_END: IEncodingEndEvent;

    EVENT_INITIALIZE: IEncodingInitializeEvent;

    EVENT_PROGRESS: IEncodingProgressEvent;

    EVENT_START: IEncodingStartEvent;

    result: Promise<Uint8Array>;
}

export interface IEncodingOptions {
    codec?: ICodecNames;

    crf?: number;

    frames: Uint8Array[];

    framerate: number;

    height: number;

    pixel_format?: IPixelFormatNames;

    width: number;
}

function EncodingOptions(options: IEncodingOptions): Required<IEncodingOptions> {
    const {
        codec = get_default_codec(),
        crf,
        frames,
        framerate,
        height,
        pixel_format,
        width,
    } = options;

    return {
        codec,
        crf: crf ?? get_default_crf(codec),
        frames,
        framerate,
        height,
        pixel_format: pixel_format ?? get_default_pixel_format(codec),
        width,
    };
}

export function encode(options: IEncodingOptions): IEncodingHandle {
    const {codec, crf, frames, framerate, height, pixel_format, width} = EncodingOptions(options);

    const [crf_minimum, crf_maximum] = get_supported_crf_range(codec);
    if (crf < crf_minimum || crf > crf_maximum) {
        throw new ReferenceError(
            `bad option 'IEncodingOptions.crf' to 'encode' (crf '${crf}' outside of '${crf_minimum}...${crf_maximum}' range for codec '${codec}')`
        );
    }

    const [width_range, height_range] = get_supported_dimensions_range(codec);

    const [width_minimum, width_maximum] = width_range;
    if (width < width_minimum || width > width_maximum) {
        throw new ReferenceError(
            `bad option 'IEncodingOptions.width' to 'encode' (width '${width}' outside of '${width_minimum}...${width_maximum}' range for codec '${codec}')`
        );
    }

    const [height_minimum, height_maximum] = height_range;
    if (height < height_minimum || height > height_maximum) {
        throw new ReferenceError(
            `bad option 'IEncodingOptions.height' to 'encode' (height '${height}' outside of '${height_minimum}...${height_maximum}' range for codec '${codec}')`
        );
    }

    const [framerate_minimum, framerate_maximum] = get_supported_framerate_range(
        codec,
        width,
        height
    );
    if (framerate < framerate_minimum || framerate > framerate_maximum) {
        throw new ReferenceError(
            `bad option 'IEncodingOptions.framerate' to 'encode' (framerate '${framerate}' outside of '${framerate_minimum}...${framerate_maximum}' range for codec '${codec}')`
        );
    }

    const codec_encoder = get_codec(codec);
    const codec_extension = get_codec_extension(codec);
    const pixel_format_name = get_pixel_format(pixel_format);

    const EVENT_END: IEncodingEndEvent = event();
    const EVENT_INITIALIZE: IEncodingInitializeEvent = event();
    const EVENT_PROGRESS: IEncodingProgressEvent = event();
    const EVENT_START: IEncodingStartEvent = event();

    return {
        EVENT_END,
        EVENT_INITIALIZE,
        EVENT_PROGRESS,
        EVENT_START,

        result: new Promise(async (resolve, reject) => {
            const ffmpeg = FFmpeg.createFFmpeg({
                progress: ({ratio}) => EVENT_PROGRESS.dispatch(ratio),
            });

            EVENT_INITIALIZE.dispatch();
            await ffmpeg.load();

            await Promise.all(
                frames.map((buffer, index) => ffmpeg.FS("writeFile", `${index}.png`, buffer))
            );

            EVENT_START.dispatch();
            await ffmpeg.run(
                "-f",
                "image2",
                "-r",
                framerate.toString(),
                "-s",
                `${width}x${height}`,
                "-i",
                "%01d.png",
                "-vcodec",
                codec_encoder,
                "-crf",
                crf.toString(),
                "-pix_fmt",
                pixel_format_name,
                ...get_codec_arguments(codec),
                `output.${codec_extension}`
            );

            const buffer = await ffmpeg.FS("readFile", `output.${codec_extension}`);

            // HACK: `ffmpeg.exit` throws errors on exiting to emulate process termination (?)
            try {
                ffmpeg.exit();
            } catch (err) {}

            EVENT_END.dispatch();
            resolve(buffer);
        }),
    };
}
