// The Kitchen Display's login. This is a screen lock for the floor, not real security: the check runs in the
// browser, so anyone who can read the page's code can read these. The ticket API behind it is not protected by it.
export const KDS_USER = 'kds'
export const KDS_PASS = 'kds123'
export const checkKdsLogin = (user, pass) => user.trim().toLowerCase() === KDS_USER && pass === KDS_PASS
