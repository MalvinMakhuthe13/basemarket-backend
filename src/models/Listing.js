import mongoose from "mongoose";

const listingSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, required: true }, // buy/sell/service/etc (whatever your UI sends)
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: "", maxlength: 2000 },

    price: { type: String, default: "" }, // keep string to match your current UI without breaking
    negotiable: { type: Boolean, default: false },

    imageUrl: { type: String, default: "" },
    imagePublicId: { type: String, default: "" },

    // optional fields your UI may send:
    category: { type: String, default: "" },
    location: { type: String, default: "" },
    contact: { type: String, default: "" },
    meta: { type: Object, default: {} },
  },
  { timestamps: true }
);

export default mongoose.model("Listing", listingSchema);
