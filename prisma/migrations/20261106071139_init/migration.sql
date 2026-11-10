-- CreateEnum
CREATE TYPE "GenSide" AS ENUM ('LEFT', 'RIGHT');

-- CreateTable
CREATE TABLE "IndexerState" (
    "id" TEXT NOT NULL,
    "lastBlock" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndexerState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractLog" (
    "id" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockTime" TIMESTAMP(3) NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "eventName" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageTier" (
    "level" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "price" DECIMAL(38,18) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackageTier_pkey" PRIMARY KEY ("level")
);

-- CreateTable
CREATE TABLE "Member" (
    "address" TEXT NOT NULL,
    "regId" INTEGER NOT NULL,
    "sponsor" TEXT NOT NULL,
    "isRoot" BOOLEAN NOT NULL DEFAULT false,
    "registeredAt" TIMESTAMP(3) NOT NULL,
    "regTxHash" TEXT,
    "highestPackage" INTEGER NOT NULL DEFAULT 0,
    "qualifiedDirects" INTEGER NOT NULL DEFAULT 0,
    "genParent" TEXT,
    "genSide" "GenSide",
    "genPlacedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "PackagePurchase" (
    "id" TEXT NOT NULL,
    "memberAddress" TEXT NOT NULL,
    "package" INTEGER NOT NULL,
    "packageBuyId" INTEGER NOT NULL,
    "price" DECIMAL(38,18) NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,

    CONSTRAINT "PackagePurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "X3Payment" (
    "id" TEXT NOT NULL,
    "receiver" TEXT NOT NULL,
    "buyer" TEXT NOT NULL,
    "package" INTEGER NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "buyerChain" INTEGER NOT NULL,
    "recycled" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,

    CONSTRAINT "X3Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "X3Routing" (
    "id" TEXT NOT NULL,
    "receiver" TEXT NOT NULL,
    "buyer" TEXT NOT NULL,
    "package" INTEGER NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "depth" INTEGER NOT NULL,
    "lapsed" BOOLEAN NOT NULL,
    "routedAt" TIMESTAMP(3) NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,

    CONSTRAINT "X3Routing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "X3Lost" (
    "id" TEXT NOT NULL,
    "lostBy" TEXT NOT NULL,
    "buyer" TEXT NOT NULL,
    "receiver" TEXT NOT NULL,
    "package" INTEGER NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "position" INTEGER NOT NULL,
    "lostAt" TIMESTAMP(3) NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,

    CONSTRAINT "X3Lost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recycle" (
    "id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "package" INTEGER NOT NULL,
    "newCycle" INTEGER NOT NULL,
    "recycledAt" TIMESTAMP(3) NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,

    CONSTRAINT "Recycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "X3Matrix" (
    "owner" TEXT NOT NULL,
    "package" INTEGER NOT NULL,
    "cycle" INTEGER NOT NULL,
    "slot1" TEXT,
    "slot2" TEXT,
    "slot3" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "X3Matrix_pkey" PRIMARY KEY ("owner","package","cycle")
);

-- CreateTable
CREATE TABLE "LevelIncome" (
    "id" TEXT NOT NULL,
    "receiver" TEXT NOT NULL,
    "buyer" TEXT NOT NULL,
    "package" INTEGER NOT NULL,
    "generation" INTEGER NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,

    CONSTRAINT "LevelIncome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LevelLapseIncome" (
    "id" TEXT NOT NULL,
    "receiver" TEXT NOT NULL,
    "buyer" TEXT NOT NULL,
    "package" INTEGER NOT NULL,
    "depth" INTEGER NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,

    CONSTRAINT "LevelLapseIncome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LevelLost" (
    "id" TEXT NOT NULL,
    "lostBy" TEXT NOT NULL,
    "buyer" TEXT NOT NULL,
    "package" INTEGER NOT NULL,
    "generation" INTEGER NOT NULL,
    "amount" DECIMAL(38,18) NOT NULL,
    "position" INTEGER NOT NULL,
    "lostAt" TIMESTAMP(3) NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,

    CONSTRAINT "LevelLost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletAddress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletAddress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContractLog_blockNumber_idx" ON "ContractLog"("blockNumber");

-- CreateIndex
CREATE INDEX "ContractLog_eventName_idx" ON "ContractLog"("eventName");

-- CreateIndex
CREATE UNIQUE INDEX "ContractLog_txHash_logIndex_key" ON "ContractLog"("txHash", "logIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Member_regId_key" ON "Member"("regId");

-- CreateIndex
CREATE INDEX "Member_sponsor_idx" ON "Member"("sponsor");

-- CreateIndex
CREATE INDEX "Member_genParent_idx" ON "Member"("genParent");

-- CreateIndex
CREATE UNIQUE INDEX "Member_genParent_genSide_key" ON "Member"("genParent", "genSide");

-- CreateIndex
CREATE UNIQUE INDEX "PackagePurchase_txHash_logIndex_key" ON "PackagePurchase"("txHash", "logIndex");

-- CreateIndex
CREATE UNIQUE INDEX "PackagePurchase_memberAddress_package_key" ON "PackagePurchase"("memberAddress", "package");

-- CreateIndex
CREATE INDEX "X3Payment_receiver_recycled_idx" ON "X3Payment"("receiver", "recycled");

-- CreateIndex
CREATE INDEX "X3Payment_buyer_idx" ON "X3Payment"("buyer");

-- CreateIndex
CREATE UNIQUE INDEX "X3Payment_txHash_logIndex_key" ON "X3Payment"("txHash", "logIndex");

-- CreateIndex
CREATE INDEX "X3Routing_receiver_idx" ON "X3Routing"("receiver");

-- CreateIndex
CREATE INDEX "X3Routing_buyer_idx" ON "X3Routing"("buyer");

-- CreateIndex
CREATE UNIQUE INDEX "X3Routing_txHash_logIndex_key" ON "X3Routing"("txHash", "logIndex");

-- CreateIndex
CREATE INDEX "X3Lost_lostBy_idx" ON "X3Lost"("lostBy");

-- CreateIndex
CREATE UNIQUE INDEX "X3Lost_txHash_logIndex_position_key" ON "X3Lost"("txHash", "logIndex", "position");

-- CreateIndex
CREATE INDEX "Recycle_owner_package_idx" ON "Recycle"("owner", "package");

-- CreateIndex
CREATE UNIQUE INDEX "Recycle_txHash_logIndex_key" ON "Recycle"("txHash", "logIndex");

-- CreateIndex
CREATE INDEX "LevelIncome_receiver_idx" ON "LevelIncome"("receiver");

-- CreateIndex
CREATE INDEX "LevelIncome_buyer_idx" ON "LevelIncome"("buyer");

-- CreateIndex
CREATE UNIQUE INDEX "LevelIncome_txHash_logIndex_key" ON "LevelIncome"("txHash", "logIndex");

-- CreateIndex
CREATE INDEX "LevelLapseIncome_receiver_idx" ON "LevelLapseIncome"("receiver");

-- CreateIndex
CREATE UNIQUE INDEX "LevelLapseIncome_txHash_logIndex_key" ON "LevelLapseIncome"("txHash", "logIndex");

-- CreateIndex
CREATE INDEX "LevelLost_lostBy_idx" ON "LevelLost"("lostBy");

-- CreateIndex
CREATE UNIQUE INDEX "LevelLost_txHash_logIndex_position_key" ON "LevelLost"("txHash", "logIndex", "position");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE INDEX "WalletAddress_userId_idx" ON "WalletAddress"("userId");

-- CreateIndex
CREATE INDEX "WalletAddress_address_idx" ON "WalletAddress"("address");

-- AddForeignKey
ALTER TABLE "PackagePurchase" ADD CONSTRAINT "PackagePurchase_memberAddress_fkey" FOREIGN KEY ("memberAddress") REFERENCES "Member"("address") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletAddress" ADD CONSTRAINT "WalletAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
