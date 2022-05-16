import "prismjs/themes/prism-tomorrow.css";

import "@kahi-ui/framework/dist/kahi-ui.framework.min.css";
import "@kahi-ui/framework/dist/kahi-ui.theme.default.min.css";

import type {SvelteComponent} from "svelte";

import {CONTEXT_APP, app} from "./lib/app";

import {app_router} from "./lib/router";

import * as Index from "./routes/index.svelte";

import * as WorkspaceIndex from "./routes/workspace/index.svelte";
import * as WorkspaceFile from "./routes/workspace/file.svelte";

(async () => {
    const app_context = await app();

    const [_, router] = app_router({
        context: {
            [CONTEXT_APP.key]: app_context,
        },

        routes: [Index, WorkspaceFile, WorkspaceIndex],
    });

    let component: SvelteComponent | null = null;

    router.subscribe((route) => {
        const splash_element = document.querySelector(".sim--splash");
        if (splash_element) splash_element.remove();

        if (component) {
            component.$destroy();
            component = null;
        }

        if (!route) return;
        const {Component, context = {}, props} = route;

        component = new Component({
            target: document.body,
            context: new Map<string, any>([
                ...Object.entries(context),
                [CONTEXT_APP.key, app_context],
            ]),

            props,
        });
    });
})();
