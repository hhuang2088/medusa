import { MedusaContainer } from "@medusajs/framework"
import { createContainer } from "@medusajs/framework/awilix"
import { MedusaError, ProductStatus } from "@medusajs/framework/utils"
import { createWorkflow, WorkflowResponse } from "@medusajs/workflows-sdk"
import { prepareVariantsAndItemsWithPricesStep } from "../get-variants-and-items-with-prices"

const buildVariant = (id: string, status = ProductStatus.PUBLISHED) => ({
  id,
  title: "Variant title",
  product: {
    id: `prod_${id}`,
    title: "Product title",
    status,
  },
})

const buildPriceSet = (calculatedAmount: number) => ({
  calculated_amount: calculatedAmount,
  original_amount: calculatedAmount,
  is_calculated_price_tax_inclusive: false,
  calculated_price: {},
})

const runStep = async (input: any): Promise<any> => {
  const container = createContainer() as unknown as MedusaContainer
  const workflow = createWorkflow(
    `prepare-variants-and-items-with-prices-test-${Math.random()
      .toString(36)
      .slice(2)}`,
    () => {
      return new WorkflowResponse(prepareVariantsAndItemsWithPricesStep(input))
    }
  )

  return workflow(container).run({ input: {} })
}

describe("prepareVariantsAndItemsWithPricesStep", () => {
  it("prepares the line items with the calculated prices", async () => {
    const { result } = await runStep({
      cart: { id: "cart_1" },
      items: [{ variant_id: "variant_1", quantity: 1 }],
      variantsData: [buildVariant("variant_1")],
      calculatedPriceSets: { variant_1: buildPriceSet(1000) },
    })

    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems[0].data).toEqual(
      expect.objectContaining({
        variant_id: "variant_1",
        unit_price: 1000,
        is_tax_inclusive: false,
      })
    )
  })

  it("throws an invalid data error when the variant has no price in the cart's region", async () => {
    // A published variant that is not priced in the cart's currency has no
    // calculated price set. See https://github.com/medusajs/medusa/issues/15932
    const run = runStep({
      cart: { id: "cart_1" },
      items: [{ variant_id: "variant_1", quantity: 1 }],
      variantsData: [buildVariant("variant_1")],
      calculatedPriceSets: {},
    })

    await expect(run).rejects.toMatchObject({
      type: MedusaError.Types.INVALID_DATA,
      message: "Variants with IDs variant_1 do not have a price",
    })
  })

  it("throws an invalid data error listing every unpriced variant", async () => {
    const run = runStep({
      cart: { id: "cart_1" },
      items: [
        { variant_id: "variant_1", quantity: 1 },
        { variant_id: "variant_2", quantity: 1 },
        { variant_id: "variant_3", quantity: 1 },
      ],
      variantsData: [
        buildVariant("variant_1"),
        buildVariant("variant_2"),
        buildVariant("variant_3"),
      ],
      calculatedPriceSets: { variant_2: buildPriceSet(1000) },
    })

    await expect(run).rejects.toMatchObject({
      type: MedusaError.Types.INVALID_DATA,
      message: "Variants with IDs variant_1, variant_3 do not have a price",
    })
  })

  it("throws the variant validation error before the missing price error", async () => {
    const run = runStep({
      cart: { id: "cart_1" },
      items: [{ variant_id: "variant_1", quantity: 1 }],
      variantsData: [buildVariant("variant_1", ProductStatus.DRAFT)],
      calculatedPriceSets: {},
    })

    await expect(run).rejects.toMatchObject({
      type: MedusaError.Types.INVALID_DATA,
      message:
        "Variants variant_1 do not exist or belong to a product that is not published",
    })
  })

  it("does not require a calculated price when the item has a custom price", async () => {
    const { result } = await runStep({
      cart: { id: "cart_1" },
      items: [{ variant_id: "variant_1", quantity: 1, unit_price: 500 }],
      variantsData: [buildVariant("variant_1")],
      calculatedPriceSets: {},
    })

    expect(result.lineItems[0].data).toEqual(
      expect.objectContaining({
        variant_id: "variant_1",
        unit_price: 500,
        is_custom_price: true,
      })
    )
  })
})
