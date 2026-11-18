// Sends every request on the old workers.dev address to the same path on
// Vice Cope's own address.
export default {
  fetch(request) {
    const { pathname, search } = new URL(request.url)
    return Response.redirect(`https://vice-cope.pages.dev${pathname}${search}`, 301)
  },
}
