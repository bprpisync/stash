console.log('randomBackgrounds running');

const GRAPHQL_URL = "/graphql";

/**
 * Extract page context from URL.
 * Adjust regexes if your Stash version uses different routes.
 */
function getPageContext() {
    const path = window.location.pathname;

    let match;

    if ((match = path.match(/^\/performers\/(\d+)/))) {
        return {
            type: "performer",
            id: match[1]
        };
    }

    if ((match = path.match(/^\/studios\/(\d+)/))) {
        return {
            type: "studio",
            id: match[1]
        };
    }

    if ((match = path.match(/^\/galleries\/(\d+)/))) {
        return {
            type: "gallery",
            id: match[1]
        };
    }

    if ((match = path.match(/^\/groups\/(\d+)/))) {
        return {
            type: "group",
            id: match[1]
        };
    }

    if ((match = path.match(/^\/tags\/(\d+)/))) {
        return {
            type: "tag",
            id: match[1]
        };
    }

    return {
        type: "home"
    };
}

async function graphql(query, variables = {}) {
    const res = await fetch(GRAPHQL_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            query,
            variables
        })
    });

    const json = await res.json();

    if (json.errors) {
        console.error("GraphQL errors:", json.errors);
    }
    console.log("GraphQL response:", json);

    return json.data;
}

function randomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

if (!document.getElementById("stash-background-style")) {
    const style = document.createElement("style");
    style.id = "stash-background-style";

    style.textContent = `
        body::after {
            content: "";
            position: fixed;
            inset: 0;
            z-index: -1;

            background-image: var(--stash-bg-image);
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;

            pointer-events: none;
        }
    `;

    document.head.appendChild(style);
}

/**
 * Fallback images:
 * Images tagged "background"
 */

async function getBackgroundTagId() {
    const data = await graphql(`
        query {
            findTags(
                tag_filter: {
                    name: {
                        value: "background"
                        modifier: EQUALS
                    }
                }
                filter: { per_page: 1 }
            ) {
                tags {
                    id
                }
            }
        }
    `);

    return data?.findTags?.tags?.[0]?.id;
}

async function getFallbackImages() {

    const tagId = await getBackgroundTagId();

    if (!tagId) {
        console.error("Background tag not found");
        return [];
    }

    const data = await graphql(`
        query($tagId: ID!) {
            findImages(
                image_filter: {
                    tags: {
                        value: [$tagId]
                        modifier: INCLUDES
                    }
                }
                filter: { per_page: 1000 }
            ) {
                images {
                    paths {
                        image
                        thumbnail
                    }
                }
            }
        }
    `, {
        tagId
    });

    console.log("Background tag ID:", tagId);
    console.log("Image query result:", data);
    return data?.findImages?.images || [];
}

async function getContextImages(context) {

    switch (context.type) {

        case "tag":
            return (
                await graphql(`
                    query($id: ID!) {
                        findImages(
                            image_filter: {
                                tags: {
                                    value: [$id]
                                    modifier: INCLUDES
                                }
                            }
                            filter: { per_page: 1000 }
                        ) {
                            images {
                                paths {
                                    image
                                    thumbnail
                                }
                            }
                        }
                    }
                `, {
                    id: context.id
                })
            ) ?.findImages?.images || [];

        case "performer":
            return (
                await graphql(`
                    query($id: ID!) {
                        findImages(
                            image_filter: {
                                performers: {
                                    value: [$id]
                                    modifier: INCLUDES
                                }
                            }
                            filter: { per_page: 1000 }
                        ) {
                            images {
                                paths {
                                    image
                                    thumbnail
                                }
                            }
                        }
                    }
                `, {
                    id: context.id
                })
            ) ?.findImages?.images || [];

        case "studio":
            return (
                await graphql(`
                    query($id: ID!) {
                        findImages(
                            image_filter: {
                                studios: {
                                    value: [$id]
                                    modifier: INCLUDES
                                }
                            }
                            filter: { per_page: 1000 }
                        ) {
                            images {
                                paths {
                                    image
                                    thumbnail
                                }
                            }
                        }
                    }
                `, {
                    id: context.id
                })
            ) ?.findImages?.images || [];

        case "gallery":
            return (
                await graphql(`
                    query($id: ID!) {
                        findImages(
                            image_filter: {
                                galleries: {
                                    value: [$id]
                                    modifier: INCLUDES
                                }
                            }
                            filter: { per_page: 1000 }
                        ) {
                            images {
                                paths {
                                    image
                                    thumbnail
                                }
                            }
                        }
                    }
                `, {
                    id: context.id
                })
            ) ?.findImages?.images || [];

        case "group":
            return (
                await graphql(`
                    query($id: ID!) {
                        findImages(
                            image_filter: {
                                groups: {
                                    value: [$id]
                                    modifier: INCLUDES
                                }
                            }
                            filter: { per_page: 1000 }
                        ) {
                            images {
                                paths {
                                    image
                                    thumbnail
                                }
                            }
                        }
                    }
                `, {
                    id: context.id
                })
            ) ?.findImages?.images || [];

        default:
            return [];
    }
}

async function setBackground() {

    console.log("Background update:", location.pathname);
    const context = getPageContext();

    let images = [];

    // Home page = random background-tagged image
    if (context.type === "home") {
        images = await getFallbackImages();
    } else {
        images = await getContextImages(context);

        // Fallback if no matches
        if (!images.length) {
            images = await getFallbackImages();
        }
    }

    if (!images.length) {
        console.warn("No background images found.");
        return;
    }

    const image = randomItem(images);

    const url =
        image.paths.image ||
        image.paths.thumbnail;

    /*document.body.style.backgroundImage = `url("${url}")`;
    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundPosition = "center";
    document.body.style.backgroundAttachment = "fixed";
    document.body.style.backgroundRepeat = "no-repeat";*/


    document.body.style.setProperty(
        "--stash-bg-image",
        `url("${url}")`
    );

    sessionStorage.setItem('curbgurl', url);

}

let currentUrl = location.href;

setBackground();

setInterval(() => {
    if (location.href !== currentUrl) {
        currentUrl = location.href;
        setBackground();
    }
}, 500);