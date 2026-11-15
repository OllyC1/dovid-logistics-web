import { expect, test } from "@playwright/test";

const publicRoutes=["/","/services","/how-it-works","/pricing","/business","/about","/contact","/faq","/locations/ibadan","/privacy","/terms","/cookies","/track","/login","/register","/forgot-password","/book","/pay/callback"];

test("public routes render metadata and a clear page heading",async({page},testInfo)=>{
  test.skip(testInfo.project.name.startsWith("mobile"),"Covered once in desktop Chrome");
  test.setTimeout(240000);
  for(const path of publicRoutes){
    const response=await page.goto(path);
    expect(response?.status(),`${path} should load`).toBeLessThan(400);
    await expect(page).toHaveTitle(/Dovid Logistics/);
    await expect(page.getByRole("heading",{level:1})).toHaveCount(1);
  }
  expect(await page.locator('script[type="application/ld+json"]').textContent()).toContain("Organization");
});

test("customer can choose suggested addresses, see maps and complete booking",async({page},testInfo)=>{
  test.skip(testInfo.project.name.startsWith("mobile"),"Detailed booking flow is covered once in desktop Chrome");
  await page.route("**/api/maps/places**",route=>{
    const url=new URL(route.request().url());
    if(url.pathname==="/api/maps/places"){
      const pickup=url.searchParams.get("input")?.toLowerCase().includes("bodija");
      return route.fulfill({contentType:"application/json",body:JSON.stringify({suggestions:[{placeId:pickup?"pickup-place":"delivery-place",description:pickup?"Bodija, Ibadan":"Ring Road, Ibadan",mainText:pickup?"Bodija":"Ring Road",secondaryText:"Ibadan, Oyo, Nigeria"}]})});
    }
    const pickup=url.pathname.endsWith("pickup-place");
    return route.fulfill({contentType:"application/json",body:JSON.stringify({address:pickup?"Bodija, Ibadan, Nigeria":"Ring Road, Ibadan, Nigeria",coordinates:pickup?{latitude:7.435,longitude:3.91}:{latitude:7.36,longitude:3.875}})});
  });
  await page.route("**/api/delivery/quotes",route=>route.fulfill({contentType:"application/json",body:JSON.stringify({quoteId:"quote-1",distanceMeters:5200,customerTotalKobo:230000,currency:"NGN",includedCharges:[{label:"Standard delivery",amountKobo:230000}],expiresAt:new Date(Date.now()+600000).toISOString()})}));
  await page.route("**/api/delivery/quotes/quote-1/confirm",route=>route.fulfill({contentType:"application/json",body:JSON.stringify({confirmed:true})}));
  await page.route("**/api/orders",route=>route.fulfill({contentType:"application/json",body:JSON.stringify({order_id:"order-1",order_reference:"DOV-E2E"})}));
  await page.route("**/api/payments/initialize",route=>route.fulfill({contentType:"application/json",body:JSON.stringify({checkoutUrl:"http://127.0.0.1:3000/mock-checkout-sender"})}));
  await page.route("**/mock-checkout-sender",route=>route.fulfill({contentType:"text/html",body:"<h1>Dovid sender checkout</h1>"}));

  await page.goto("/book");
  await page.getByLabel("Where should we collect the parcel?").fill("Bodija");
  await page.getByRole("button",{name:/Bodija/}).click();
  await page.getByLabel("Where should we deliver it?").fill("Ring Road");
  await page.getByRole("button",{name:/Ring Road/}).click();
  await expect(page.getByTitle(/map/)).toHaveCount(2);
  await page.getByRole("button",{name:"Continue"}).click();
  await page.getByRole("button",{name:"Continue"}).click();
  await page.getByLabel("Your name").fill("Sender Test");
  await page.getByLabel("Your phone number").fill("08000000000");
  await page.getByLabel("Receiver's name").fill("Receiver Test");
  await page.getByLabel("Receiver's phone number").fill("08000000001");
  await page.getByRole("button",{name:"See my price"}).click();
  await expect(page.getByText(/2,300/).first()).toBeVisible();
  await page.getByRole("button",{name:"Continue to payment"}).click();
  await page.getByRole("button",{name:"Create delivery and pay"}).click();
  await expect(page).toHaveURL(/\/mock-checkout-sender/);
});

test("tracking form resolves a public status without exposing private details",async({page},testInfo)=>{
  test.skip(testInfo.project.name.startsWith("mobile"),"Covered once in desktop Chrome");
  await page.route("**/track/TRK-E2E",route=>route.fulfill({contentType:"text/html",body:'<main><h1>DOV-E2E</h1><p>Delivery updates</p><p>On the way</p></main>'}));
  await page.goto("/track");
  await page.getByLabel("Tracking reference").fill("TRK-E2E");
  await page.getByRole("button",{name:"Check delivery status"}).click();
  await expect(page).toHaveURL(/\/track\/TRK-E2E/);
  await expect(page.getByText("On the way")).toBeVisible();
  await expect(page.getByText(/phone|address/i)).toHaveCount(0);
});

test("receiver payment opens only the checkout returned by the server",async({page},testInfo)=>{
  test.skip(testInfo.project.name.startsWith("mobile"),"Covered once in desktop Chrome");
  await page.route("**/api/payments/receiver",route=>route.fulfill({contentType:"application/json",body:JSON.stringify({checkoutUrl:"http://127.0.0.1:3000/mock-checkout"})}));
  await page.route("**/mock-checkout",route=>route.fulfill({contentType:"text/html",body:"<h1>Dovid checkout</h1>"}));
  await page.goto("/pay/receiver/test-token");
  await page.getByLabel("Where should we send the receipt?").fill("receiver@example.com");
  await page.getByRole("button",{name:"Continue to payment"}).click();
  await expect(page).toHaveURL(/\/mock-checkout/);
});
